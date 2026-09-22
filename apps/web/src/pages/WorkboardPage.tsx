import type { BoardCard, BoardColumn, BoardView, ScopeItem, TaskCategory } from '@gameweld/domain';
import { CATEGORY_LABELS, STATE_LABELS, TASK_CATEGORY_LABELS, todoKindFor } from '@gameweld/domain';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError } from '../api.ts';
import { boardFiltersOn, boardItemsOf, matchesCard, useCardFilters } from '../cardFilters.ts';
import { ActionMenu } from '../components/ActionMenu.tsx';
import { CardFilterControls, CardFilterRow } from '../components/CardFilterBar.tsx';
import { AssigneePicker } from '../components/AssigneePicker.tsx';
import { CardLanes, type Lane } from '../components/CardLanes.tsx';
import { ChecklistProgress } from '../components/Checklist.tsx';
import { coverImages, NOT_A_COVER_IMAGE } from '../components/coverDrop.ts';
import { DisplayMenu } from '../components/DisplayMenu.tsx';
import { History } from '../components/History.tsx';
import { RequestsPanel } from '../components/RequestsPanel.tsx';
import { daysUntil, formatDay, LabelChips, TaskFlags } from '../components/TaskBadges.tsx';
import { t, tj, tp } from '../i18n/index.ts';
import { useTaskLinks } from '../taskLinks.ts';
import { useProject } from './ProjectPage.tsx';

/**
 * The project's active Workboard, or, under its own address, one that was archived. An archived
 * board is history: the same page shows it, and nothing on it can be changed, which the page
 * already holds to wherever it asks whether the board is active.
 */
export function WorkboardPage() {
  const { project, reload: reloadProject, dataVersion } = useProject();
  const { boardId } = useParams<{ boardId?: string }>();
  const canManage = project.permissions['board.manage'];
  const [board, setBoard] = useState<BoardView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    link?: { to: string; state?: unknown; label: string };
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      setBoard(boardId ? await api.board(project.id, boardId) : await api.activeBoard(project.id));
    } catch (e) {
      setBoard(null);
      setError(
        e instanceof ApiError && e.status === 404
          ? t('That Workboard does not exist.')
          : t('Could not load the Workboard'),
      );
    }
  }, [project.id, boardId]);

  // Also after a task's window, open over the board, changed something.
  useEffect(() => {
    void reload();
  }, [reload, dataVersion]);

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
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
      await reload();
      return false;
    }
  }

  if (board === undefined) return <p>{t('Loading…')}</p>;

  if (board === null && boardId) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
        <Link to={`/projects/${project.id}/board`}>{t('← The active Workboard')}</Link>
      </div>
    );
  }
  if (board === null) {
    return (
      <div className="panel">
        <h2>{t('No active Workboard')}</h2>
        {canManage ? (
          <CreateBoardForm
            onCreate={(name) => run(() => api.createBoard(project.id, { name }))}
            error={error}
          />
        ) : (
          <p className="muted">
            {t('A Game Director creates the Workboard when the team is ready to plan work.')}
          </p>
        )}
        <ArchivedBoards projectId={project.id} />
      </div>
    );
  }

  return (
    <div data-testid="workboard">
      {board.state === 'archived' && (
        <p className="notice info" data-testid="archived-notice">
          {board.archivedAt
            ? t(
                'This Workboard was archived on {date}. It is history: it shows the cards as they stood, and nothing on it can be changed.',
                { date: new Date(board.archivedAt).toLocaleDateString() },
              )
            : t(
                'This Workboard was archived. It is history: it shows the cards as they stood, and nothing on it can be changed.',
              )}{' '}
          <Link to={`/projects/${project.id}/board`}>{t('The active Workboard')}</Link>
        </p>
      )}
      <BoardHeader
        board={board}
        onSaved={run}
        onArchived={async () => {
          // Under the active board's address there is now no board; the archived one is a link.
          await reloadProject();
          await reload();
        }}
      />
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
              <Link to={notice.link.to} state={notice.link.state}>
                {notice.link.label}
              </Link>
            </>
          )}
        </p>
      )}
      <Columns board={board} onChange={run} onNotice={setNotice} />
      <RequestsPanel board={board} onBoardChanged={reload} />
      <History query={{ entityType: 'workboard', entityId: board.id }} />
      <ArchivedBoards projectId={project.id} except={board.id} />
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
      aria-label={t('Create Workboard')}
    >
      <p className="muted">
        {t(
          'A Workboard holds the current portion of work: a sprint, a week, a milestone, or a continuous period. The product does not infer deadlines or rules from its name.',
        )}
      </p>
      <label>
        {t('Name')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('September production')}
          required
          maxLength={200}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div>
        <button type="submit" className="primary" disabled={name.trim() === ''}>
          {t('Create Workboard')}
        </button>
      </div>
    </form>
  );
}

/** The project's past Workboards, each a way into how it stood when it was archived. */
function ArchivedBoards({ projectId, except }: { projectId: string; except?: string }) {
  const { dataVersion } = useProject();
  const [boards, setBoards] = useState<{ id: string; name: string; archivedAt: string | null }[]>(
    [],
  );
  useEffect(() => {
    void api
      .boards(projectId)
      .then((all) => setBoards(all.filter((b) => b.state === 'archived' && b.id !== except)));
  }, [projectId, except, dataVersion]);
  if (boards.length === 0) return null;
  return (
    <section className="archived-boards" aria-labelledby="archived-boards-heading">
      <h3 id="archived-boards-heading">{t('Archived Workboards')}</h3>
      <ul className="links">
        {boards.map((b) => (
          <li key={b.id}>
            <Link to={`/projects/${projectId}/board/${b.id}`}>{b.name}</Link>{' '}
            <span className="muted">
              {t('archived {date}', {
                date: b.archivedAt ? new Date(b.archivedAt).toLocaleDateString() : '',
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
  const boardItems = useMemo(() => boardItemsOf(board), [board]);
  const c = board.counts;
  return (
    <header className="section-head board-header">
      <div className="section-head-title">
        {renaming ? (
          <form
            className="add-item"
            aria-label={t('Rename Workboard')}
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
              aria-label={t('Workboard name')}
              maxLength={200}
              autoFocus
            />
            <button type="submit" className="primary" disabled={name.trim() === ''}>
              {t('Save')}
            </button>
            <button type="button" onClick={() => setRenaming(false)}>
              {t('Cancel')}
            </button>
          </form>
        ) : (
          <h2>
            {canManage && board.state === 'active' ? (
              <button
                type="button"
                className="title-edit"
                title={t('Click to rename this Workboard')}
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
        <div className="muted board-counts" data-testid="board-counts">
          <ScopeMenu board={board} onChange={onSaved} />
          <BoardEnd board={board} canManage={canManage} onChange={onSaved} />
          {c.acceptedItems > 0 && <span>{t('{n} accepted', { n: c.acceptedItems })}</span>}
          {c.outOfScopeTasks > 0 && (
            <span>
              <strong>{c.outOfScopeTasks}</strong> {tp(c.outOfScopeTasks, 'out-of-scope task')}
            </span>
          )}
          <span>
            {t('{done}/{placed} tasks done', {
              done: c.placedTasks - c.unfinishedTasks,
              placed: c.placedTasks,
            })}
          </span>
          {c.pendingRequests > 0 && (
            <span>
              <strong>{c.pendingRequests}</strong> {tp(c.pendingRequests, 'pending request')}
            </span>
          )}
        </div>
      </div>
      <div className="row page-controls">
        <CardFilterControls
          projectId={project.id}
          people={project.members}
          boardItems={boardItems}
          labels={project.labels}
        />
        <DisplayMenu />
        {canManage && !archiving && board.state === 'active' && (
          <ActionMenu label={t('Workboard actions')}>
            {!renaming && board.state === 'active' && (
              <button
                type="button"
                data-close-menu
                onClick={() => {
                  setName(board.name);
                  setRenaming(true);
                }}
              >
                {t('Rename')}
              </button>
            )}
            <button type="button" data-close-menu onClick={() => setArchiving(true)}>
              {t('Archive Workboard')}
            </button>
          </ActionMenu>
        )}
        {canManage && archiving && (
          <div className="confirm" role="group" aria-label={t('Archive Workboard')}>
            <p>
              {c.unfinishedTasks > 0
                ? t(
                    '{n} unfinished {tasks} will return to Breakdown. Nothing is marked complete.',
                    { n: c.unfinishedTasks, tasks: tp(c.unfinishedTasks, 'task') },
                  )
                : t('The board becomes read-only history.')}
            </p>
            {c.pendingRequests > 0 && (
              <p>
                {t(
                  'Pending placement requests will be rejected with the note “Workboard archived”.',
                )}
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
              {c.unfinishedTasks > 0 ? t('Return tasks and archive') : t('Archive')}
            </button>
            <button type="button" onClick={() => setArchiving(false)}>
              {t('Cancel')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * The optional end of the period the board covers. The product infers nothing from it: it is
 * there so that everyone sees the same day, and how far off it is.
 */
function BoardEnd({
  board,
  canManage,
  onChange,
}: {
  board: BoardView;
  canManage: boolean;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
}) {
  const { project } = useProject();
  const left = board.endsOn ? daysUntil(board.endsOn) : null;
  const text =
    board.endsOn === null || left === null
      ? t('Set an end date')
      : left < 0
        ? t('Ends {day} · {n} {days} ago', {
            day: formatDay(board.endsOn),
            n: -left,
            days: tp(-left, 'day'),
          })
        : left === 0
          ? t('Ends {day} · today', { day: formatDay(board.endsOn) })
          : t('Ends {day} · {n} {days} left', {
              day: formatDay(board.endsOn),
              n: left,
              days: tp(left, 'day'),
            });
  const editable = canManage && board.state === 'active';
  if (!editable) return board.endsOn ? <span data-testid="board-end">{text}</span> : null;
  const save = (endsOn: string | null) =>
    void onChange(() => api.updateBoard(project.id, board.id, { version: board.version, endsOn }));
  return (
    <ActionMenu
      label={text}
      triggerClassName={`scope-pill${board.endsOn ? '' : ' unset'}`}
      triggerContent={<span data-testid="board-end">{text}</span>}
      align="start"
    >
      <label className="menu-field first">
        {t('The Workboard ends on')}
        <input
          type="date"
          value={board.endsOn ?? ''}
          onChange={(e) => save(e.target.value || null)}
        />
      </label>
      {board.endsOn && (
        <button type="button" data-close-menu onClick={() => save(null)}>
          {t('Clear the date')}
        </button>
      )}
      <p className="menu-note">{t('Only a date for everyone to see; nothing happens on it.')}</p>
    </ActionMenu>
  );
}

/**
 * The board's scope, behind the pill that counts it: the items, what state each is in, the way
 * to its Breakdown and out of the scope, and what the Director can do about the scope right now.
 * It used to be a panel of its own above the columns; the top of the board is quieter without it.
 */
function ScopeMenu({
  board,
  onChange,
}: {
  board: BoardView;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
}) {
  const { project } = useProject();
  const canSelect = project.permissions['board.select_scope'];
  const [removing, setRemoving] = useState<string | null>(null);
  const full = board.counts.scopeItems >= board.scopeLimit;
  const toReview = board.scope.filter((s) => s.state === 'ready_for_review').length;
  const stateOf = (s: ScopeItem) => (s.accepted ? t('Accepted') : t(STATE_LABELS[s.state]));

  const remove = (item: ScopeItem, returnTasks: boolean) =>
    void onChange(() => api.removeFromScope(project.id, board.id, item.id, { returnTasks })).then(
      () => setRemoving(null),
    );

  return (
    <ActionMenu
      label={t('{n}/{limit} items in scope', {
        n: board.counts.scopeItems,
        limit: board.scopeLimit,
      })}
      triggerClassName={`scope-pill${toReview > 0 ? ' review' : ''}`}
      popoverClassName="scope-popover"
      align="start"
      triggerContent={
        <>
          <span>
            {tj(
              '<1>{n}</1>/{limit} items in scope',
              { n: board.counts.scopeItems, limit: board.scopeLimit },
              { 1: (s) => <strong>{s}</strong> },
            )}
          </span>
          {/* An item waiting for acceptance is the one thing about the scope worth a glance. */}
          {toReview > 0 && (
            <>
              <span className="dot review" aria-hidden="true" />
              <span className="sr-only">{t(', {n} ready for review', { n: toReview })}</span>
            </>
          )}
          <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">
            <path
              d="m4 6 4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </>
      }
    >
      <section className="scope" aria-labelledby="scope-heading" data-testid="scope">
        <h3 id="scope-heading">
          {t('Scope')}{' '}
          <span className="count">
            {board.counts.scopeItems}/{board.scopeLimit}
          </span>
        </h3>
        {board.state === 'active' && (
          <p className="scope-guidance">
            {full
              ? t('Scope limit reached. Remove an item to make room.')
              : board.nextEligible
                ? tj(
                    'Next in priority: <1>{title}</1>. Add items from their <2>Backlog cards</2>.',
                    { title: board.nextEligible.title },
                    {
                      1: (s) => <strong>{s}</strong>,
                      2: (s) => <Link to={`/projects/${project.id}/backlog`}>{s}</Link>,
                    },
                  )
                : t(
                    'No open item waits outside the scope. Add items from the Backlog when there are some.',
                  )}
          </p>
        )}
        {board.scope.length === 0 ? (
          <p className="muted small">
            {t('No items in scope yet. Use “Add to Workboard” on a Backlog card.')}
          </p>
        ) : (
          <ul className="scope-items">
            {board.scope.map((s) => (
              <li
                key={s.id}
                className={s.accepted ? 'accepted' : undefined}
                data-testid="scope-item"
              >
                <div className="scope-item-head">
                  <span
                    className={`dot ${s.accepted ? 'done' : s.state === 'ready_for_review' ? 'review' : ''}`}
                    aria-hidden="true"
                  />
                  <Link
                    to={`/projects/${project.id}/breakdown/${s.id}`}
                    className="scope-title"
                    title={t('Open in Breakdown')}
                  >
                    {s.title}
                  </Link>
                  <span
                    className={`badge ${s.accepted ? 'done' : s.state === 'ready_for_review' ? '' : 'neutral'}`}
                  >
                    {stateOf(s)}
                  </span>
                </div>
                <p className="muted small">
                  {t('{category} · {done}/{total} tasks complete · added {date}', {
                    category: t(CATEGORY_LABELS[s.category]),
                    done: s.taskCounts.completed,
                    total: s.taskCounts.total,
                    date: new Date(s.addedAt).toLocaleDateString(),
                  })}
                </p>
                {canSelect &&
                  board.state === 'active' &&
                  (removing === s.id ? (
                    <div
                      className="confirm small"
                      role="group"
                      aria-label={t('Remove {title} from scope', { title: s.title })}
                    >
                      <p>{t('What happens to its unfinished tasks on this board?')}</p>
                      <button type="button" onClick={() => remove(s, true)}>
                        {t('Return them to Breakdown')}
                      </button>
                      <button type="button" onClick={() => remove(s, false)}>
                        {t('Keep them as out-of-scope work')}
                      </button>
                      <button type="button" onClick={() => setRemoving(null)}>
                        {t('Cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setRemoving(s.id)}
                      aria-label={t('Remove {title} from scope', { title: s.title })}
                    >
                      {t('Remove from scope')}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ActionMenu>
  );
}

function Columns({
  board,
  onChange,
  onNotice,
}: {
  board: BoardView;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
  onNotice: (
    notice: { text: string; link?: { to: string; state?: unknown; label: string } } | null,
  ) => void;
}) {
  const { project } = useProject();
  const tasks = useTaskLinks(project.id);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const canWork = project.permissions['task.work'] && board.state === 'active';
  const canComplete = project.permissions['task.complete'];
  const canDelete = project.permissions['backlog.manage'] && board.state === 'active';
  const canManage = project.permissions['board.manage'] && board.state === 'active';
  const columnById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board.columns]);
  const [filters, changeFilters] = useCardFilters(project.id);
  const filtering = boardFiltersOn(filters);
  const boardItems = useMemo(() => boardItemsOf(board), [board]);
  // An item that left the board cannot be chosen again, so it must not go on filtering unseen.
  useEffect(() => {
    if (filters.itemId && !boardItems.some((item) => item.id === filters.itemId))
      changeFilters({ itemId: '' });
  }, [filters.itemId, boardItems, changeFilters]);

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
    ...(canManage
      ? { titleNode: <ColumnTitle column={col} board={board} onChange={onChange} /> }
      : {}),
    items: filtering
      ? (board.cards[col.id] ?? []).filter((card) => matchesCard(card, filters))
      : (board.cards[col.id] ?? []),
    total: (board.cards[col.id] ?? []).length,
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
    <>
      <CardFilterRow
        projectId={project.id}
        board
        shown={lanes.reduce((sum, lane) => sum + lane.items.length, 0)}
        total={board.counts.placedTasks}
        noun={t('tasks')}
      />
      <CardLanes
        lanes={lanes}
        reorder={!filtering}
        collapseKey={`board:${board.id}`}
        canDrag={canWork}
        canDrop={canDrop}
        onFilesDrop={canWork ? (card, files) => void attachImages(card, files) : undefined}
        onCardClick={(card) => void tasks.open(card.id)}
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
            <LabelChips labels={card.labels} />
            <div className="card-head">
              <Link {...tasks.link(card.id)} className="card-title">
                {card.title}
              </Link>
              {canDelete && deleting !== card.id && (
                <ActionMenu label={t('{title} actions', { title: card.title })}>
                  <button
                    type="button"
                    data-close-menu
                    onClick={() => setDeleting(card.id)}
                    aria-label={t('Delete {title}', { title: card.title })}
                  >
                    {t('Delete task')}
                  </button>
                </ActionMenu>
              )}
            </div>
            <div className="card-meta">
              <span className="muted">{card.itemTitle}</span>
              <TaskFlags task={card} />
              <ChecklistProgress checklist={card.checklist} />
              {card.outOfScope && <span className="badge warn">{t('Out of scope')}</span>}
              {uploading === card.id && <span role="status">{t('Uploading…')}</span>}
            </div>
            <div className="card-bottom">
              <span className={`category-label cat-${card.category}`}>
                {t(TASK_CATEGORY_LABELS[card.category])}
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
                aria-label={t('Confirm deleting {title}', { title: card.title })}
              >
                <p>
                  {t(
                    'Delete this task from “{item}”? It will leave the Workboard and no longer count toward the item’s completion. Its history is kept, and you can restore it.',
                    { item: card.itemTitle },
                  )}
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
                          text: t('“{title}” deleted from “{item}”.', {
                            title: card.title,
                            item: card.itemTitle,
                          }),
                          link: { ...tasks.link(card.id), label: t('View deleted task') },
                        });
                      }
                    })
                  }
                >
                  {t('Delete task')}
                </button>
                <button type="button" onClick={() => setDeleting(null)}>
                  {t('Cancel')}
                </button>
              </div>
            )}
          </>
        )}
      />
    </>
  );
}

/**
 * A column's name, renamed where it stands: a click turns it into a field, Enter saves, Escape
 * or a click elsewhere leaves it as it was. The column's menu keeps its own "Rename".
 */
function ColumnTitle({
  column,
  board,
  onChange,
}: {
  column: BoardColumn;
  board: BoardView;
  onChange: (action: () => Promise<BoardView | void>) => Promise<boolean>;
}) {
  const { project } = useProject();
  const [name, setName] = useState<string | null>(null);
  if (name === null)
    return (
      <button
        type="button"
        className="title-edit lane-title-edit"
        title={t('Click to rename this column')}
        onClick={() => setName(column.name)}
      >
        {column.name}
      </button>
    );
  return (
    <form
      className="lane-title-form"
      aria-label={t('Rename {name}', { name: column.name })}
      onSubmit={(e) => {
        e.preventDefault();
        const next = name.trim();
        if (next === '' || next === column.name) return setName(null);
        void onChange(() =>
          api.updateColumn(project.id, board.id, column.id, {
            version: column.version,
            name: next,
          }),
        ).then(() => setName(null));
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setName(null)}
        onBlur={() => setName(null)}
        aria-label={t('Column name')}
        maxLength={100}
        autoFocus
      />
    </form>
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
    <ActionMenu label={t('{name} column actions', { name: column.name })}>
      {canManage && (
        <div className="column-admin">
          {renaming ? (
            <form
              className="add-item"
              aria-label={t('Rename column {name}', { name: column.name })}
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
                aria-label={t('Column name')}
                maxLength={100}
                autoFocus
              />
              <button type="submit" disabled={name.trim() === ''}>
                {t('Save')}
              </button>
              <button type="button" onClick={() => setRenaming(false)}>
                {t('Cancel')}
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                className="link"
                onClick={() => setRenaming(true)}
                aria-label={t('Rename column {name}', { name: column.name })}
              >
                {t('Rename')}
              </button>
              {column.kind === 'intermediate' && (
                <button
                  type="button"
                  className="link"
                  disabled={!empty}
                  title={empty ? undefined : t('Move the tasks out first')}
                  onClick={() =>
                    void onChange(() => api.deleteColumn(project.id, board.id, column.id))
                  }
                  aria-label={t('Delete column {name}', { name: column.name })}
                >
                  {t('Delete')}
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
                      aria-label={t('Add column after {name}', { name: column.name })}
                    >
                      {t('+ Column')}
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
      aria-label={t('Add column')}
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(name.trim());
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('Column name')}
        aria-label={t('New column name')}
        maxLength={100}
        autoFocus
      />
      <button type="submit" disabled={name.trim() === ''}>
        {t('Add')}
      </button>
      <button type="button" onClick={onCancel}>
        {t('Cancel')}
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
        aria-label={t('New {category} task', { category: t(TASK_CATEGORY_LABELS[category]) })}
      >
        {t('+ New task')}
      </button>
    );
  }
  const parentRequired = board.scope.length !== 1;
  return (
    <form
      className="form new-card"
      aria-label={t('New {category} task', { category: t(TASK_CATEGORY_LABELS[category]) })}
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
        {t('Title')}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          autoFocus
          required
        />
      </label>
      <label>
        {t('Backlog item')}
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          required={parentRequired}
          aria-label={t('Parent backlog item')}
        >
          {board.scope.length !== 1 && (
            <option value="">
              {board.scope.length === 0 ? t('Choose an item…') : t('Choose an item in scope…')}
            </option>
          )}
          {board.scope.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          {canPlaceOutside && others.length > 0 && (
            <optgroup label={t('Outside scope (placed as an exception)')}>
              {others.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {board.scope.length === 1 && (
          <span className="hint">{t('The only item in scope, selected by default.')}</span>
        )}
      </label>
      <div className="row">
        <button
          type="submit"
          className="primary"
          disabled={title.trim() === '' || (parentRequired && !itemId)}
        >
          {t('Add to board')}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
