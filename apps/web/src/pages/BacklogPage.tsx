import type { BacklogItem, BacklogLane, BoardView, MoscowCategory } from '@gameweld/domain';
import {
  BACKLOG_LANES,
  CATEGORY_LABELS,
  LANE_LABELS,
  laneOf,
  MOSCOW_CATEGORIES,
} from '@gameweld/domain';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { backlogFiltersOn, matchesItem, useCardFilters } from '../cardFilters.ts';
import { ActionMenu } from '../components/ActionMenu.tsx';
import { CardFilterControls, CardFilterRow } from '../components/CardFilterBar.tsx';
import { CardLanes, type Lane } from '../components/CardLanes.tsx';
import { coverImages, NOT_A_COVER_IMAGE } from '../components/coverDrop.ts';
import { DisplayMenu } from '../components/DisplayMenu.tsx';
import { useProject } from './ProjectPage.tsx';

const isCategory = (lane: string): lane is MoscowCategory =>
  (MOSCOW_CATEGORIES as readonly string[]).includes(lane);

export function BacklogPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const canManage = project.permissions['backlog.manage'];
  const [items, setItems] = useState<BacklogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSelectScope = project.permissions['board.select_scope'];
  const [board, setBoard] = useState<BoardView | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  // A dropped picture becomes the item's cover, which only backlog editors may change.
  const canSetCover = project.permissions['backlog.manage'];
  const [uploading, setUploading] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextItems, nextBoard] = await Promise.all([
      api.backlog(project.id),
      api.activeBoard(project.id),
    ]);
    setItems(nextItems);
    setBoard(nextBoard);
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

  /** Dropped images become attachments; the server makes the last one the cover. */
  async function attachImages(item: BacklogItem, files: File[]) {
    const images = coverImages(files);
    if (images.length === 0) {
      setError(NOT_A_COVER_IMAGE);
      return;
    }
    setUploading(item.id);
    await run(async () => {
      for (const file of images) await api.uploadAttachment(project.id, { itemId: item.id }, file);
    });
    setUploading(null);
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

  const [filters] = useCardFilters(project.id);
  const filtering = backlogFiltersOn(filters);

  const lanes: Lane<BacklogItem>[] = useMemo(
    () =>
      BACKLOG_LANES.map((lane) => ({
        id: lane,
        title: LANE_LABELS[lane],
        items: filtering
          ? grouped.get(lane)!.filter((item) => matchesItem(item, filters))
          : grouped.get(lane)!,
        total: grouped.get(lane)!.length,
        droppable: isCategory(lane),
        className: isCategory(lane) ? `prio-${lane}` : `lifecycle state-${lane}`,
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
    [grouped, canManage, project.id, filtering, filters],
  );

  if (items === null) return <p>Loading…</p>;

  return (
    <div data-testid="backlog">
      <header className="page-head row between">
        <div>
          <p className="eyebrow">Production scope</p>
          <h1>Backlog</h1>
          <p className="muted small">
            {items.length} items · {items.filter((item) => item.activeBoard).length} on the
            Workboard
          </p>
        </div>
        <div className="row page-controls">
          <CardFilterControls projectId={project.id} people={project.members} />
          <DisplayMenu />
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <CardFilterRow
        projectId={project.id}
        board={false}
        shown={lanes.reduce((sum, lane) => sum + lane.items.length, 0)}
        total={items.length}
        noun="items"
      />
      <CardLanes
        lanes={lanes}
        reorder={!filtering}
        collapseKey={`backlog:${project.id}`}
        canDrag={canManage}
        isDraggable={(item) => item.state === 'open'}
        onFilesDrop={canSetCover ? (item, files) => void attachImages(item, files) : undefined}
        // A click anywhere on a card opens the item, as a click on a task's card opens the task.
        onCardClick={(item) => void navigate(`/projects/${project.id}/breakdown/${item.id}`)}
        onMove={(item, laneId, afterId, beforeId) =>
          move(item, laneId as MoscowCategory, afterId, beforeId)
        }
        renderCard={(item, { index, count }) => (
          <>
            {item.coverAttachmentId && (
              <img
                className="cover"
                src={api.coverUrl(project.id, item.coverAttachmentId)}
                alt=""
                loading="lazy"
                decoding="async"
                // An image the server cannot read leaves the card without a cover, not a broken icon.
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <div className="card-head">
              <Link to={`/projects/${project.id}/breakdown/${item.id}`} className="card-title">
                {item.title}
              </Link>
              <Link
                to={`/projects/${project.id}/breakdown/${item.id}`}
                className="card-open"
                aria-label={`Open ${item.title} in the Breakdown`}
                title="Open in the Breakdown"
              >
                {/* One node splitting into three: what the Breakdown does to an item. */}
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5.5" y="1.5" width="5" height="3.5" rx="1" />
                  <path d="M8 5v3M2.75 10.5V8h10.5v2.5M8 8v2.5" />
                  <rect x="1" y="10.5" width="3.5" height="3.5" rx="1" />
                  <rect x="6.25" y="10.5" width="3.5" height="3.5" rx="1" />
                  <rect x="11.5" y="10.5" width="3.5" height="3.5" rx="1" />
                </svg>
              </Link>
              {canManage && item.state === 'open' && (
                <ActionMenu label={`${item.title} actions`}>
                  <button
                    type="button"
                    data-close-menu
                    onClick={() => moveBy(item, -1)}
                    // Up and down are places among all the lane's cards, not the ones showing.
                    disabled={filtering || index === 0}
                    aria-label={`Move ${item.title} up`}
                  >
                    <span aria-hidden="true">↑</span> Move up
                  </button>
                  <button
                    type="button"
                    data-close-menu
                    onClick={() => moveBy(item, 1)}
                    disabled={filtering || index === count - 1}
                    aria-label={`Move ${item.title} down`}
                  >
                    <span aria-hidden="true">↓</span> Move down
                  </button>
                  <label className="menu-field">
                    Category
                    <select
                      aria-label={`Move ${item.title} to category`}
                      value={item.category}
                      onChange={(e) =>
                        void move(item, e.target.value as MoscowCategory, null, null)
                      }
                    >
                      {MOSCOW_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                </ActionMenu>
              )}
            </div>
            <div className="card-foot">
              <div className="card-meta">
                {item.taskCounts.total > 0 ? (
                  <span className="task-progress" title="Completed tasks / all tasks">
                    <progress value={item.taskCounts.completed} max={item.taskCounts.total} />
                    {item.taskCounts.completed}/{item.taskCounts.total} tasks
                  </span>
                ) : (
                  <span className="muted">No tasks yet</span>
                )}
                {item.activeBoard && <span className="badge">On {item.activeBoard.name}</span>}
                {item.state === 'ready_for_review' && (
                  <span className="badge">Awaiting acceptance</span>
                )}
                {item.state === 'done' && <span className="badge done">Accepted</span>}
                {uploading === item.id && <span role="status">Uploading…</span>}
                {item.state !== 'open' && (
                  <span className="muted">{CATEGORY_LABELS[item.category]}</span>
                )}
              </div>
              {/* The way onto the Workboard. With several boards this button opens a choice of board. */}
              {canSelectScope &&
                board &&
                item.state === 'open' &&
                !item.activeBoard &&
                activating !== item.id && (
                  <button
                    type="button"
                    className={`to-board${board.nextEligible?.id === item.id ? ' next' : ''}`}
                    disabled={board.counts.scopeItems >= board.scopeLimit}
                    title={
                      board.counts.scopeItems >= board.scopeLimit
                        ? `Scope limit reached (${board.counts.scopeItems}/${board.scopeLimit})`
                        : board.nextEligible?.id === item.id
                          ? `Add to ${board.name} · next in priority`
                          : board.nextEligible
                            ? `Add to ${board.name} · “${board.nextEligible.title}” is next in priority`
                            : `Add to ${board.name}`
                    }
                    onClick={() => setActivating(item.id)}
                    aria-label={`Add ${item.title} to Workboard`}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </button>
                )}
            </div>
            {activating === item.id && board && (
              <div className="confirm small" role="group" aria-label={`Activate ${item.title}`}>
                <p>
                  Joins the scope of <strong>{board.name}</strong>; its unfinished tasks enter the
                  To Do columns, and tasks added later in the Breakdown join the board too.
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    void run(() => api.addToScope(project.id, board.id, item.id)).then(() =>
                      setActivating(null),
                    )
                  }
                >
                  Activate
                </button>
                <button type="button" onClick={() => setActivating(null)}>
                  Cancel
                </button>
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
