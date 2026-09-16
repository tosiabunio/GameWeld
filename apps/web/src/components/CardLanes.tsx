import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Generic lanes of draggable cards, shared by the Backlog (items) and later the Workboard (tasks).
 *
 * Dragging updates a local copy of the lanes immediately so the card follows the pointer across
 * lanes; on drop, `onMove` is called with the card's new neighbours and the parent reloads the
 * authoritative order. Keyboard dragging (space to pick up, arrows to move, space to drop) comes
 * from dnd-kit, so the drag path is accessible without a pointer.
 */
export interface Lane<T> {
  id: string;
  title: string;
  items: T[];
  /** Cards may be dropped into this lane. */
  droppable: boolean;
  className?: string;
  footer?: ReactNode;
}

export interface CardRenderContext {
  index: number;
  count: number;
  isDragging: boolean;
}

export interface CardLanesProps<T extends { id: string }> {
  lanes: Lane<T>[];
  /** Whether the current user may drag at all. */
  canDrag: boolean;
  /** Per-card override, for example to pin cards that are not open. */
  isDraggable?: (item: T) => boolean;
  /** Per-card, per-lane rule on top of `lane.droppable`, for example category-specific columns. */
  canDrop?: (item: T, laneId: string) => boolean;
  renderCard: (item: T, ctx: CardRenderContext) => ReactNode;
  onMove: (
    item: T,
    laneId: string,
    afterId: string | null,
    beforeId: string | null,
  ) => Promise<void>;
  testIdPrefix?: string;
}

export function CardLanes<T extends { id: string }>({
  lanes,
  canDrag,
  isDraggable,
  canDrop,
  renderCard,
  onMove,
  testIdPrefix = 'lane',
}: CardLanesProps<T>) {
  const [local, setLocal] = useState<Record<string, T[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId) return; // do not clobber an in-progress drag with a stale reload
    setLocal(Object.fromEntries(lanes.map((l) => [l.id, l.items])));
  }, [lanes, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => {
    const map = new Map<string, T>();
    for (const lane of lanes) for (const item of lane.items) map.set(item.id, item);
    return map;
  }, [lanes]);

  const laneOfId = (id: string): string | undefined => {
    if (id in local) return id;
    return Object.keys(local).find((laneId) => local[laneId]!.some((i) => i.id === id));
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const fromLane = laneOfId(String(active.id));
    const toLane = laneOfId(String(over.id));
    if (!fromLane || !toLane || fromLane === toLane) return;
    if (!lanes.find((l) => l.id === toLane)?.droppable) return;
    const dragged = byId.get(String(active.id));
    if (dragged && canDrop && !canDrop(dragged, toLane)) return;

    setLocal((prev) => {
      const source = prev[fromLane]!;
      const target = prev[toLane]!;
      const item = source.find((i) => i.id === active.id);
      if (!item) return prev;
      const overIndex = target.findIndex((i) => i.id === over.id);
      // Dropping over the lane itself appends; over a card inserts at that card's position.
      let insertAt = overIndex === -1 ? target.length : overIndex;
      if (overIndex !== -1 && active.rect.current.translated) {
        const below = active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        insertAt = overIndex + (below ? 1 : 0);
      }
      const nextTarget = [...target];
      nextTarget.splice(insertAt, 0, item);
      return {
        ...prev,
        [fromLane]: source.filter((i) => i.id !== active.id),
        [toLane]: nextTarget,
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    setActiveId(null);
    const lane = laneOfId(id);
    const item = byId.get(id);
    if (!lane || !item) return;

    let items = local[lane]!;
    if (over && over.id !== id) {
      const overLane = laneOfId(String(over.id));
      if (overLane === lane) {
        const from = items.findIndex((i) => i.id === id);
        const to = items.findIndex((i) => i.id === over.id);
        if (from !== -1 && to !== -1 && from !== to) {
          items = [...items];
          items.splice(to, 0, items.splice(from, 1)[0]!);
          setLocal((prev) => ({ ...prev, [lane]: items }));
        }
      }
    }
    const index = items.findIndex((i) => i.id === id);
    const afterId = items[index - 1]?.id ?? null;
    const beforeId = items[index + 1]?.id ?? null;

    // Only call the server when something actually changed.
    const originalLane = lanes.find((l) => l.items.some((i) => i.id === id));
    const originalIndex = originalLane?.items.findIndex((i) => i.id === id) ?? -1;
    if (originalLane?.id === lane && originalIndex === index) return;
    await onMove(item, lane, afterId, beforeId);
  }

  const activeItem = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="lanes">
        {lanes.map((lane) => (
          <LaneView
            key={lane.id}
            lane={lane}
            items={local[lane.id] ?? lane.items}
            testId={`${testIdPrefix}-${lane.id}`}
            rejects={
              activeItem !== undefined && canDrop !== undefined && !canDrop(activeItem, lane.id)
            }
          >
            {(local[lane.id] ?? lane.items).map((item, index, all) => (
              <Card
                key={item.id}
                id={item.id}
                disabled={!canDrag || !lane.droppable || (isDraggable ? !isDraggable(item) : false)}
              >
                {renderCard(item, { index, count: all.length, isDragging: item.id === activeId })}
              </Card>
            ))}
          </LaneView>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="card overlay">
            {renderCard(activeItem, { index: 0, count: 0, isDragging: true })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function LaneView<T extends { id: string }>({
  lane,
  items,
  testId,
  rejects,
  children,
}: {
  lane: Lane<T>;
  items: T[];
  testId: string;
  rejects: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: lane.id,
    disabled: !lane.droppable || rejects,
  });
  return (
    <section
      ref={setNodeRef}
      className={`lane${lane.className ? ` ${lane.className}` : ''}${isOver && lane.droppable && !rejects ? ' over' : ''}${rejects ? ' rejects' : ''}`}
      aria-label={lane.title}
      data-testid={testId}
    >
      <h3>
        {lane.title} <span className="count">{items.length}</span>
      </h3>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="cards">{children}</ul>
      </SortableContext>
      {lane.footer}
    </section>
  );
}

function Card({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`card${isDragging ? ' dragging' : ''}${disabled ? '' : ' draggable'}`}
      data-testid="item-card"
      {...(disabled ? {} : { ...attributes, ...listeners })}
    >
      {children}
    </li>
  );
}
