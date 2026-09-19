import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MyTask } from '@gameweld/domain';
import { TASK_CATEGORY_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { DisplayMenu } from '../components/DisplayMenu.tsx';
import { TaskStatus } from '../components/TaskStatus.tsx';
import { isCardClick, useTaskLinks } from '../taskLinks.ts';
import { useProject } from './ProjectPage.tsx';

/**
 * The viewer's unfinished tasks in this project as one free board: cards run left to right, then
 * down, in the order the viewer gave them. The order is the viewer's own priority list; it moves
 * no task on the Workboard and nobody else sees it.
 */
export function MyTasksPage() {
  const { project, refreshMyTasks, dataVersion } = useProject();
  const taskLinks = useTaskLinks(project.id);
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.myTasks(project.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your tasks');
    }
  }, [project.id]);

  // Also after a task's window, open over the board, changed something.
  useEffect(() => {
    void reload();
  }, [reload, dataVersion]);

  // The keyboard sensor keeps the options it had when the drag began, so the coordinate getter
  // reads the order through a ref rather than from a stale closure.
  const order = useRef<string[]>([]);
  useLayoutEffect(() => {
    order.current = (tasks ?? []).map((t) => t.id);
  });
  /** Where the last keyboard step aimed; the collision detection honours it exactly. */
  const keyboardTarget = useRef<string | null>(null);

  /**
   * Keyboard moves that follow the reading order. dnd-kit's sortable getter picks the nearest
   * card "to the right" by comparing left edges, and the card below can sit a subpixel to the
   * right of the dragged one, so Right moved cards down instead. Here Left and Right step one
   * place in the order, and Up and Down step one row, which is as many places as a row has cards.
   */
  const gridKeyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, { context }) => {
    const { active, over, droppableRects } = context;
    if (!active || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code))
      return undefined;
    event.preventDefault();
    const ids = order.current;
    const top = (id: string | undefined) => (id ? droppableRects.get(id)?.top : undefined);
    const firstTop = top(ids[0]);
    const perRow = ids.filter((id) => Math.abs((top(id) ?? NaN) - (firstTop ?? 0)) < 1).length;
    // The card's slot is the card it is over; the cards only reorder in state on drop.
    const at = ids.indexOf(String(over?.id ?? active.id));
    if (at === -1 || perRow === 0) return undefined;
    const last = ids.length - 1;
    let next =
      at + { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[event.code]!;
    // Down from above a short last row lands on that row's last card.
    if (next > last && Math.floor(last / perRow) > Math.floor(at / perRow)) next = last;
    const rect = droppableRects.get(ids[next] ?? '');
    if (!rect) return undefined;
    keyboardTarget.current = ids[next]!;
    return { x: rect.left, y: rect.top };
  }, []);

  /** dnd-kit's closest centre, except that a keyboard step lands exactly where the getter aimed. */
  const collide: CollisionDetection = useCallback((args) => {
    const id = keyboardTarget.current;
    const container = id && args.droppableContainers.find((c) => c.id === id);
    return container
      ? [{ id, data: { droppableContainer: container, value: 0 } }]
      : closestCenter(args);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: gridKeyboardCoordinates }),
  );

  async function onDragEnd({ active, over }: DragEndEvent) {
    keyboardTarget.current = null;
    setActiveId(null);
    if (!tasks || !over || over.id === active.id) return;
    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;
    // The card lands at once; the server's answer is the authoritative order.
    const moved = arrayMove(tasks, from, to);
    setTasks(moved);
    setError(null);
    try {
      setTasks(
        await api.moveMyTask(project.id, String(active.id), {
          afterId: moved[to - 1]?.id ?? null,
          beforeId: moved[to + 1]?.id ?? null,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      await reload();
    }
    // A neighbour that vanished mid-drag may have been this viewer's last other task.
    void refreshMyTasks();
  }

  if (tasks === null) return error ? <p className="error">{error}</p> : <p>Loading…</p>;

  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  const card = (task: MyTask, index: number) => (
    <>
      {task.coverAttachmentId && (
        <img
          className="cover"
          src={api.coverUrl(project.id, task.coverAttachmentId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="card-head">
        <Link {...taskLinks.link(task.id)} className="card-title">
          {task.title}
        </Link>
      </div>
      <div className="card-meta">
        <span className="muted">{task.itemTitle}</span>
        <TaskStatus task={task} />
      </div>
      <div className="card-bottom">
        <span className={`category-label cat-${task.category}`}>
          {TASK_CATEGORY_LABELS[task.category]}
        </span>
        <span className="my-task-order" aria-label={`Priority ${index + 1} of ${tasks.length}`}>
          {index + 1}
        </span>
      </div>
    </>
  );

  return (
    <div data-testid="my-tasks">
      <header className="page-head row between">
        <div>
          <p className="eyebrow">Assigned to you</p>
          <h1>My tasks</h1>
          <p className="muted small">
            {tasks.length === 0
              ? 'No unfinished tasks are assigned to you in this project.'
              : `${tasks.length} unfinished task${tasks.length === 1 ? '' : 's'}. Drag the cards into the order you mean to work in; the order is yours alone.`}
          </p>
        </div>
        <DisplayMenu lanes={false} />
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={(e) => {
          keyboardTarget.current = null;
          setActiveId(String(e.active.id));
        }}
        onDragEnd={(e) => void onDragEnd(e)}
        onDragCancel={() => {
          keyboardTarget.current = null;
          setActiveId(null);
        }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={rectSortingStrategy}>
          <ol className="free-board" aria-label="My tasks, in my order">
            {tasks.map((task, index) => (
              <SortableCard
                key={task.id}
                id={task.id}
                disabled={tasks.length < 2}
                onOpen={() => void taskLinks.open(task.id)}
              >
                {card(task, index)}
              </SortableCard>
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div className="card overlay">{card(active, tasks.indexOf(active))}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableCard({
  id,
  disabled,
  onOpen,
  children,
}: {
  id: string;
  disabled: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  // The card itself is the drag handle, as in the lanes, so keys pressed on the link inside it
  // stay the link's own.
  const ref = (node: HTMLLIElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };
  return (
    <li
      ref={ref}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`card clickable${isDragging ? ' dragging' : ''}${disabled ? '' : ' draggable'}`}
      data-testid="my-task-card"
      onClick={(e) => isCardClick(e) && onOpen()}
      {...(disabled ? {} : { ...attributes, ...listeners })}
    >
      {children}
    </li>
  );
}
