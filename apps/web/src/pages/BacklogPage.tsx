import type { BacklogItem, BacklogLane, MoscowCategory } from '@gameweld/domain';
import {
  BACKLOG_LANES,
  CATEGORY_LABELS,
  LANE_LABELS,
  laneOf,
  MOSCOW_CATEGORIES,
} from '@gameweld/domain';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { CardLanes, type Lane } from '../components/CardLanes.tsx';
import { useProject } from './ProjectPage.tsx';

const isCategory = (lane: string): lane is MoscowCategory =>
  (MOSCOW_CATEGORIES as readonly string[]).includes(lane);

export function BacklogPage() {
  const { project } = useProject();
  const canManage = project.permissions['backlog.manage'];
  const [items, setItems] = useState<BacklogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await api.backlog(project.id));
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<BacklogLane, BacklogItem[]>(BACKLOG_LANES.map((l) => [l, []]));
    for (const item of items ?? []) map.get(laneOf(item))!.push(item);
    for (const lane of ['ready_for_review', 'done'] as const) {
      map.get(lane)!.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [items]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
    await reload();
  }

  const move = (
    item: BacklogItem,
    category: MoscowCategory,
    afterId: string | null,
    beforeId: string | null,
  ) => run(() => api.moveItem(project.id, item.id, { category, afterId, beforeId }));

  /** Non-drag alternative: shift a card one slot within its lane. */
  function moveBy(item: BacklogItem, delta: -1 | 1) {
    const lane = grouped.get(item.category)!;
    const idx = lane.findIndex((i) => i.id === item.id);
    const target = idx + delta;
    if (target < 0 || target >= lane.length) return;
    const without = lane.filter((i) => i.id !== item.id);
    void move(item, item.category, without[target - 1]?.id ?? null, without[target]?.id ?? null);
  }

  const lanes: Lane<BacklogItem>[] = useMemo(
    () =>
      BACKLOG_LANES.map((lane) => ({
        id: lane,
        title: LANE_LABELS[lane],
        items: grouped.get(lane)!,
        droppable: isCategory(lane),
        ...(isCategory(lane) ? {} : { className: 'lifecycle' }),
        ...(isCategory(lane) && canManage
          ? {
              footer: (
                <AddItemForm
                  category={lane}
                  onAdd={(title) =>
                    run(() => api.createItem(project.id, { title, category: lane }))
                  }
                />
              ),
            }
          : {}),
      })),
    [grouped, canManage, project.id],
  );

  if (items === null) return <p>Loading…</p>;

  return (
    <div data-testid="backlog">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <CardLanes
        lanes={lanes}
        canDrag={canManage}
        isDraggable={(item) => item.state === 'open'}
        onMove={(item, laneId, afterId, beforeId) =>
          move(item, laneId as MoscowCategory, afterId, beforeId)
        }
        renderCard={(item, { index, count }) => (
          <>
            <Link to={item.id} className="card-title">
              {item.title}
            </Link>
            <div className="card-meta">
              {item.taskCounts.total > 0 ? (
                <span title="Completed tasks / all tasks">
                  {item.taskCounts.completed}/{item.taskCounts.total} tasks
                </span>
              ) : (
                <span className="muted">No tasks yet</span>
              )}
              {item.activeBoard && <span className="badge">On {item.activeBoard.name}</span>}
              {item.state !== 'open' && (
                <span className="muted">{CATEGORY_LABELS[item.category]}</span>
              )}
            </div>
            {canManage && item.state === 'open' && (
              <div className="card-actions" aria-label={`Move ${item.title}`}>
                <button
                  type="button"
                  onClick={() => moveBy(item, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveBy(item, 1)}
                  disabled={index === count - 1}
                  aria-label={`Move ${item.title} down`}
                >
                  ↓
                </button>
                <select
                  aria-label={`Move ${item.title} to category`}
                  value={item.category}
                  onChange={(e) => void move(item, e.target.value as MoscowCategory, null, null)}
                >
                  {MOSCOW_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}

function AddItemForm({
  category,
  onAdd,
}: {
  category: MoscowCategory;
  onAdd: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    await onAdd(value);
  }
  return (
    <form
      className="add-item"
      onSubmit={submit}
      aria-label={`Add item to ${CATEGORY_LABELS[category]}`}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New backlog item"
        aria-label={`New item in ${CATEGORY_LABELS[category]}`}
        maxLength={500}
      />
      <button type="submit" disabled={title.trim() === ''}>
        Add
      </button>
    </form>
  );
}
