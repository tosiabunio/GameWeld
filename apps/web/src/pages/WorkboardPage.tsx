import type { BoardCard, BoardColumn, BoardView, ScopeItem, TaskCategory } from '@gameweld/domain';
import { CATEGORY_LABELS, STATE_LABELS, TASK_CATEGORY_LABELS, todoKindFor } from '@gameweld/domain';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { ActionMenu } from '../components/ActionMenu.tsx';
import { AssigneePicker } from '../components/AssigneePicker.tsx';
import { CardLanes, type Lane } from '../components/CardLanes.tsx';
import { coverImages, NOT_A_COVER_IMAGE } from '../components/coverDrop.ts';
import { History } from '../components/History.tsx';
import { RequestsPanel } from '../components/RequestsPanel.tsx';
import { useProject } from './ProjectPage.tsx';

export function WorkboardPage() {
  const { project, reload: reloadProject } = useProject();
  const canManage = project.permissions['board.manage'];
  const [board, setBoard] = useState<BoardView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    link?: { to: string; label: string };
  } | null>(null);

  const reload = useCallback(async () => {
    setBoard(await api.activeBoard(project.id));
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs a board mutation; every endpoint returns the fresh view, and conflicts reload. */
  async function run(action: () => Promise<BoardView | void>): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      if (next) setBoard(next);
      else await reload();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      await reload();
      return false;
    }
  }

  if (board === undefined) return <p>Loading…</p>;

  if (board === null) {
    return (
      <div className="panel">
        <h2>No active Workboard</h2>
        {canManage ? (
          <CreateBoardForm
            onCreate={(name) => run(() => api.createBoard(project.id, { name }))}
            error={error}
          />
        ) : (
          <p className="muted">
            A Game Director creates the Workboard when the team is ready to plan work.
          </p>
        )}
        <ArchivedBoards projectId={project.id} />
      </div>
    );
  }

  return (
    <div data-testid="workboard">
      <BoardHeader board={board} onSaved={run} onArchived={() => reloadProject()} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice info" role="status" data-testid="board-notice">
          {notice.text}
          {notice.link && (
            <>
              {' '}
              <Link to={notice.link.to}>{notice.link.label}</Link>
            </>
          )}
        </p>
      )}
      <ScopePanel board={board} onChange={run} />
      <Columns board={board} onChange={run} onNotice={setNotice} />
      <RequestsPanel board={board} onBoardChanged={reload} />
      <History query={{ entityType: 'workboard', entityId: board.id }} />
    </div>
  );
}

function CreateBoardForm({
  onCreate,
  error,
}: {
  onCreate: (name: string) => Promise<boolean>;
  error: string | null;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void onCreate(name.trim());
      }}
      aria-label="Create Workboard"
    >
      <p className="muted">
        A Workboard holds the current portion of work: a sprint, a week, a milestone, or a
        continuous period. The product does not infer deadlines or rules from its name.
      </p>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="September production"
          required
          maxLength={200}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div>
        <button type="submit" className="primary" disabled={name.trim() === ''}>
          Create Workboard
        </button>
      </div>
    </form>
  );
}

function ArchivedBoards({ projectId }: { projectId: string }) {
  const [boards, setBoards] = useState<{ id: string; name: string; archivedAt: string | null }[]>(
    [],
  );
  useEffect(() => {
    api.boards(projectId).then((all) => setBoards(all.filter((b) => b.state === 'archived')));
  }, [projectId]);
  if (boards.length === 0) return null;
  return (
    <>
      <h3>Archived Workboards</h3>
      <ul className="links">
        {boards.map((b) => (
          <li key={b.id}>
            {b.name}{' '}
            <span className="muted">
              archived {b.archivedAt ? new Date(b.archivedAt).toLocaleDateString() : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function BoardHeader({
  board,
  onSaved,
  onArchived,
}: {
  board: BoardView;
  onSaved: (action: () => Promise<BoardView | void>) => Promise<boolean>;
  onArchived: () => Promise<void>;
}) {
  const { project } = useProject();
  const canManage = project.permissions['board.manage'];
  const [archiving, setArchiving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(board.name);
  const c = board.counts;
  return (
    <header className="board-header">
      <div>
        <p className="eyebrow">Workboard</p>
        {renaming ? (
          <form
            className="add-item"
            aria-label="Rename Workboard"
            onSubmit={(e) => {
              e.preventDefault();
              void onSaved(() =>
                api.updateBoard(project.id, board.id, {
                  version: board.version,
                  name: name.trim(),
                }),
              ).then((ok) => ok && setRenaming(false));
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Workboard name"
              maxLength={200}
              autoFocus
            />
            <button type="submit" className="primary" disabled={name.trim() === ''}>
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <h2>
            {canManage && board.state === 'active' ? (
              <button
                type="button"
                className="title-edit"
                title="Click to rename this Workboard"
                onClick={() => {
                  setName(board.name);
                  setRenaming(true);
                }}
              >
                {board.name}{' '}
                <span className="pencil" aria-hidden="true">
                  ✎
                </span>
              </button>
            ) : (
              board.name
            )}
          </h2>
        )}
        <p className="muted board-counts" data-testid="board-counts">
          <span>
            <strong>{c.scopeItems}</strong>/{board.scopeLimit} items in scope
          </span>
          {c.acceptedItems > 0 && <span>{c.acceptedItems} accepted</span>}
          {c.outOfScopeTasks > 0 && (
            <span>
              <strong>{c.outOfScopeTasks}</strong> out-of-scope task
              {c.outOfScopeTasks === 1 ? '' : 's'}
            </span>
          )}
          <span>
            {c.placedTasks - c.unfinishedTasks}/{c.placedTasks} tasks done
          </span>
          {c.pendingRequests > 0 && (
            <span>
              <strong>{c.pendingRequests}</strong> pending request
              {c.pendingRequests === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </div>
      {canManage && (
        <div className="row">
          {!archiving && (
            <ActionMenu label="Workboard actions">
              {!renaming && board.state === 'active' && (
                <button
                  type="button"
                  data-close-menu
                  onClick={() => {
                    setName(board.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              )}
              <button type="button" data-close-menu onClick={() => setArchiving(true)}>
                Archive Workboard
              </button>
            </ActionMenu>
          )}
          {archiving && (
            <div className="confirm" role="group" aria-label="Archive Workboard">
              <p>
                {c.unfinishedTasks > 0
                  ? `${c.unfinishedTasks} unfinished task${c.unfinishedTasks === 1 ? '' : 's'} will return to Breakdown. Nothing is marked complete.`
                  : 'The board becomes read-only history.'}
              </p>
              {c.pendingRequests > 0 && (
                <p>
                  Pending placement requests will be rejected with the note “Workboard archived”.
                </p>
              )}
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void onSaved(() =>
                    api.archiveBoard(project.id, board.id, { returnUnfinished: true }),
                  ).then((ok) => {
                    if (ok) void onArchived();
                  })
                }
              >
                {c.unfinishedTasks > 0 ? 'Return tasks and archive' : 'Archive'}
              </button>
              <button type="button" onClick={() => setArchiving(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function ScopePanel({
  board,
  onChange,
}: {
  board: BoardView;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
}) {
  const { project } = useProject();
  const canSelect = project.permissions['board.select_scope'];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ScopeItem | null>(null);
  const full = board.counts.scopeItems >= board.scopeLimit;
  const expandedItem = board.scope.find((s) => s.id === expanded) ?? null;

  return (
    <section className="panel scope" aria-labelledby="scope-heading" data-testid="scope">
      <div className="row between">
        <h3 id="scope-heading">
          Scope{' '}
          <span className="count">
            {board.counts.scopeItems}/{board.scopeLimit}
          </span>
        </h3>
        {board.state === 'active' && (
          <span className="scope-guidance">
            {full ? (
              'Scope limit reached. Remove an item to make room.'
            ) : board.nextEligible ? (
              <>
                Next in priority: <strong>{board.nextEligible.title}</strong>. Add items from their{' '}
                <Link to={`/projects/${project.id}/backlog`}>Backlog cards</Link>.
              </>
            ) : (
              'No open item is eligible. Add items from the Backlog when there are some.'
            )}
          </span>
        )}
      </div>
      {board.scope.length === 0 ? (
        <p className="muted small">
          No items in scope yet. Use “Add to Workboard” on a Backlog card.
        </p>
      ) : (
        <ul className="scope-chips">
          {board.scope.map((s) => {
            const open = expanded === s.id;
            return (
              <li
                key={s.id}
                className={`scope-chip${s.accepted ? ' accepted' : ''}${open ? ' open' : ''}`}
                data-testid="scope-item"
              >
                <button
                  type="button"
                  className="scope-toggle"
                  aria-expanded={open}
                  title={`${CATEGORY_LABELS[s.category]} · ${s.taskCounts.completed}/${s.taskCounts.total} tasks complete`}
                  onClick={() => {
                    setExpanded(open ? null : s.id);
                    setRemoving(null);
                  }}
                >
                  <span className="scope-title">{s.title}</span>
                  <span
                    className={`dot ${s.accepted ? 'done' : s.state === 'ready_for_review' ? 'review' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{s.accepted ? 'Accepted' : STATE_LABELS[s.state]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {expandedItem && (
        <div className="scope-details" data-testid="scope-details">
          <div className="row between">
            <div>
              <strong>{expandedItem.title}</strong>{' '}
              <span
                className={`badge ${expandedItem.accepted ? 'done' : expandedItem.state === 'ready_for_review' ? '' : 'neutral'}`}
              >
                {expandedItem.accepted ? 'Accepted' : STATE_LABELS[expandedItem.state]}
              </span>
              <span className="muted small">
                {' '}
                · {CATEGORY_LABELS[expandedItem.category]} · {expandedItem.taskCounts.completed}/
                {expandedItem.taskCounts.total} tasks complete · added{' '}
                {new Date(expandedItem.addedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="row">
              <Link to={`/projects/${project.id}/breakdown/${expandedItem.id}`}>
                Open in Breakdown
              </Link>
              {canSelect && board.state === 'active' && removing?.id !== expandedItem.id && (
                <button type="button" onClick={() => setRemoving(expandedItem)}>
                  Remove from scope
                </button>
              )}
              <button
                type="button"
                className="link"
                onClick={() => setExpanded(null)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>
          </div>
          {removing?.id === expandedItem.id && (
            <div
              className="confirm small"
              role="group"
              aria-label={`Remove ${expandedItem.title} from scope`}
            >
              <p>What happens to its unfinished tasks on this board?</p>
              <button
                type="button"
                onClick={() =>
                  void onChange(() =>
                    api.removeFromScope(project.id, board.id, expandedItem.id, {
                      returnTasks: true,
                    }),
                  ).then(() => {
                    setRemoving(null);
                    setExpanded(null);
                  })
                }
              >
                Return them to Breakdown
              </button>
              <button
                type="button"
                onClick={() =>
                  void onChange(() =>
                    api.removeFromScope(project.id, board.id, expandedItem.id, {
                      returnTasks: false,
                    }),
                  ).then(() => {
                    setRemoving(null);
                    setExpanded(null);
                  })
                }
              >
                Keep them as out-of-scope work
              </button>
              <button type="button" onClick={() => setRemoving(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Columns({
  board,
  onChange,
  onNotice,
}: {
  board: BoardView;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
  onNotice: (notice: { text: string; link?: { to: string; label: string } } | null) => void;
}) {
  const { project } = useProject();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const canWork = project.permissions['task.work'] && board.state === 'active';
  const canComplete = project.permissions['task.complete'];
  const canDelete = project.permissions['backlog.manage'] && board.state === 'active';
  const canManage = project.permissions['board.manage'] && board.state === 'active';
  const columnById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board.columns]);

  const canDrop = (card: BoardCard, columnId: string) => {
    const target = columnById.get(columnId);
    if (!target) return false;
    if (target.kind.startsWith('todo_') && target.kind !== todoKindFor(card.category)) return false;
    const from = columnById.get(card.placement!.columnId);
    if ((target.kind === 'done') !== (from?.kind === 'done') && !canComplete) return false;
    return true;
  };

  /** Dropped images become the task's attachments; the server makes the last one the cover. */
  async function attachImages(card: BoardCard, files: File[]) {
    const images = coverImages(files);
    setUploading(card.id);
    await onChange(async () => {
      if (images.length === 0) throw new ApiError(400, NOT_A_COVER_IMAGE);
      for (const file of images) await api.uploadAttachment(project.id, { taskId: card.id }, file);
    });
    setUploading(null);
  }

  const lanes: Lane<BoardCard>[] = board.columns.map((col) => ({
    id: col.id,
    title: col.name,
    items: board.cards[col.id] ?? [],
    droppable: canWork,
    className: `column kind-${col.kind}`,
    actions: canManage ? (
      <ColumnFooter column={col} board={board} canManage={canManage} onChange={onChange} />
    ) : undefined,
    footer:
      canWork && col.kind.startsWith('todo_') ? (
        <NewCardForm
          board={board}
          category={col.kind.slice(5) as TaskCategory}
          onCreate={(input) => onChange(() => api.createBoardTask(project.id, board.id, input))}
        />
      ) : undefined,
  }));

  return (
    <CardLanes
      lanes={lanes}
      collapseKey={`board:${board.id}`}
      canDrag={canWork}
      canDrop={canDrop}
      onFilesDrop={canWork ? (card, files) => void attachImages(card, files) : undefined}
      testIdPrefix="column"
      onMove={(card, columnId, afterId, beforeId) =>
        onChange(() =>
          api.movePlacement(project.id, board.id, card.id, { columnId, afterId, beforeId }),
        ).then(() => undefined)
      }
      renderCard={(card) => (
        <>
          {card.coverAttachmentId && (
            <img
              className="cover"
              src={api.coverUrl(project.id, card.coverAttachmentId)}
              alt=""
              loading="lazy"
              decoding="async"
              // An image the server cannot read leaves the card without a cover, not a broken icon.
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div className="card-head">
            <Link
              to={`/projects/${project.id}/tasks/${card.id}`}
              state={{ from: 'board' }}
              className="card-title"
            >
              {card.title}
            </Link>
            {canDelete && deleting !== card.id && (
              <ActionMenu label={`${card.title} actions`}>
                <button
                  type="button"
                  data-close-menu
                  onClick={() => setDeleting(card.id)}
                  aria-label={`Delete ${card.title}`}
                >
                  Delete task
                </button>
              </ActionMenu>
            )}
          </div>
          <div className="card-meta">
            <span className="muted">{card.itemTitle}</span>
            {card.outOfScope && <span className="badge warn">Out of scope</span>}
            {uploading === card.id && <span role="status">Uploading…</span>}
          </div>
          <div className="card-bottom">
            <span className={`category-label cat-${card.category}`}>
              {TASK_CATEGORY_LABELS[card.category]}
            </span>
            <AssigneePicker
              assignee={card.assignee}
              people={project.members}
              taskTitle={card.title}
              onAssign={
                canWork
                  ? (assigneeId) =>
                      onChange(async () => {
                        await api.updateTask(project.id, card.id, {
                          version: card.version,
                          assigneeId,
                        });
                      })
                  : undefined
              }
            />
          </div>
          {deleting === card.id && (
            <div
              className="confirm small"
              role="group"
              aria-label={`Confirm deleting ${card.title}`}
            >
              <p>
                Delete this task from “{card.itemTitle}”? It will leave the Workboard and no longer
                count toward the item’s completion. Its history is kept, and you can restore it.
              </p>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void onChange(async () => {
                    await api.updateTask(project.id, card.id, {
                      version: card.version,
                      archived: true,
                    });
                  }).then((ok) => {
                    if (ok) {
                      setDeleting(null);
                      onNotice({
                        text: `“${card.title}” deleted from “${card.itemTitle}”.`,
                        link: {
                          to: `/projects/${project.id}/tasks/${card.id}`,
                          label: 'View deleted task',
                        },
                      });
                    }
                  })
                }
              >
                Delete task
              </button>
              <button type="button" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    />
  );
}

function ColumnFooter({
  column,
  board,
  canManage,
  onChange,
}: {
  column: BoardColumn;
  board: BoardView;
  canManage: boolean;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
}) {
  const { project } = useProject();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [adding, setAdding] = useState(false);
  const empty = (board.cards[column.id] ?? []).length === 0;

  return (
    <ActionMenu label={`${column.name} column actions`}>
      {canManage && (
        <div className="column-admin">
          {renaming ? (
            <form
              className="add-item"
              aria-label={`Rename column ${column.name}`}
              onSubmit={(e) => {
                e.preventDefault();
                void onChange(() =>
                  api.updateColumn(project.id, board.id, column.id, {
                    version: column.version,
                    name: name.trim(),
                  }),
                ).then(() => setRenaming(false));
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Column name"
                maxLength={100}
                autoFocus
              />
              <button type="submit" disabled={name.trim() === ''}>
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                className="link"
                onClick={() => setRenaming(true)}
                aria-label={`Rename column ${column.name}`}
              >
                Rename
              </button>
              {column.kind === 'intermediate' && (
                <button
                  type="button"
                  className="link"
                  disabled={!empty}
                  title={empty ? undefined : 'Move the tasks out first'}
                  onClick={() =>
                    void onChange(() => api.deleteColumn(project.id, board.id, column.id))
                  }
                  aria-label={`Delete column ${column.name}`}
                >
                  Delete
                </button>
              )}
              {column.kind !== 'done' && (
                <>
                  {adding ? (
                    <AddColumnForm
                      afterId={column.kind === 'intermediate' ? column.id : null}
                      onAdd={(newName) =>
                        onChange(() =>
                          api.createColumn(project.id, board.id, {
                            name: newName,
                            afterColumnId: column.kind === 'intermediate' ? column.id : null,
                          }),
                        ).then(() => setAdding(false))
                      }
                      onCancel={() => setAdding(false)}
                    />
                  ) : column.kind === 'intermediate' || column.kind === 'todo_content' ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setAdding(true)}
                      aria-label={`Add column after ${column.name}`}
                    >
                      + Column
                    </button>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      )}
    </ActionMenu>
  );
}

function AddColumnForm({
  afterId: _afterId,
  onAdd,
  onCancel,
}: {
  afterId: string | null;
  onAdd: (name: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="add-item"
      aria-label="Add column"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(name.trim());
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Column name"
        aria-label="New column name"
        maxLength={100}
        autoFocus
      />
      <button type="submit" disabled={name.trim() === ''}>
        Add
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/** Section 8: creating a card on the board. One item in scope is the default parent; several require a choice. */
function NewCardForm({
  board,
  category,
  onCreate,
}: {
  board: BoardView;
  category: TaskCategory;
  onCreate: (input: { itemId?: string; category: TaskCategory; title: string }) => Promise<boolean>;
}) {
  const { project } = useProject();
  const canPlaceOutside = project.permissions['out_of_scope.approve'];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [itemId, setItemId] = useState<string>(board.scope.length === 1 ? board.scope[0]!.id : '');
  const [others, setOthers] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (board.scope.length === 1) setItemId(board.scope[0]!.id);
  }, [board.scope]);
  useEffect(() => {
    if (open && canPlaceOutside) {
      api
        .backlog(project.id)
        .then((items) =>
          setOthers(
            items
              .filter((i) => i.state === 'open' && !board.scope.some((s) => s.id === i.id))
              .map((i) => ({ id: i.id, title: i.title })),
          ),
        );
    }
  }, [open, canPlaceOutside, project.id, board.scope]);

  if (!open) {
    return (
      <button
        type="button"
        className="link"
        onClick={() => setOpen(true)}
        aria-label={`New ${TASK_CATEGORY_LABELS[category]} task`}
      >
        + New task
      </button>
    );
  }
  const parentRequired = board.scope.length !== 1;
  return (
    <form
      className="form new-card"
      aria-label={`New ${TASK_CATEGORY_LABELS[category]} task`}
      onSubmit={(e) => {
        e.preventDefault();
        void onCreate({ ...(itemId ? { itemId } : {}), category, title: title.trim() }).then(
          (ok) => {
            if (ok) {
              setTitle('');
              setOpen(false);
            }
          },
        );
      }}
    >
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          autoFocus
          required
        />
      </label>
      <label>
        Backlog item
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          required={parentRequired}
          aria-label="Parent backlog item"
        >
          {board.scope.length !== 1 && (
            <option value="">
              {board.scope.length === 0 ? 'Choose an item…' : 'Choose an item in scope…'}
            </option>
          )}
          {board.scope.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          {canPlaceOutside && others.length > 0 && (
            <optgroup label="Outside scope (placed as an exception)">
              {others.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {board.scope.length === 1 && (
          <span className="hint">The only item in scope, selected by default.</span>
        )}
      </label>
      <div className="row">
        <button
          type="submit"
          className="primary"
          disabled={title.trim() === '' || (parentRequired && !itemId)}
        >
          Add to board
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
