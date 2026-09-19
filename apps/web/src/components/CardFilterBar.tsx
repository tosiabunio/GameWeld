import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategory } from '@gameweld/domain';
import { backlogFiltersOn, boardFiltersOn, UNASSIGNED, useCardFilters } from '../cardFilters.ts';
import { ActionMenu } from './ActionMenu.tsx';

/**
 * Search and filters for the Backlog's and the Workboard's cards, each behind an icon beside the
 * Display menu, so the top of the page stays quiet until they are wanted. The search field comes
 * out beside its icon; the filter icon counts the filters that are on.
 */
export function CardFilterControls({
  projectId,
  people,
  boardItems,
  labels = [],
}: {
  projectId: string;
  people: { userId: string; displayName: string }[];
  /** The Workboard passes the backlog items its cards belong to, and gets its own filters. */
  boardItems?: { id: string; title: string }[];
  /** The project's labels, for the Workboard's label filter. */
  labels?: { id: string; name: string }[];
}) {
  const [filters, change] = useCardFilters(projectId);
  const on =
    Number(filters.assignee !== '') +
    Number(filters.type !== '') +
    (boardItems
      ? Number(filters.itemId !== '') +
        Number(filters.outOfScope) +
        Number(filters.label !== '') +
        Number(filters.blocked)
      : 0);
  const searching = filters.searchOpen || filters.text.trim() !== '';
  return (
    <>
      {searching && (
        <input
          type="search"
          role="searchbox"
          className="header-search"
          value={filters.text}
          onChange={(e) => change({ text: e.target.value })}
          onKeyDown={(e) => e.key === 'Escape' && change({ searchOpen: false, text: '' })}
          placeholder="Search titles…"
          aria-label="Search titles"
          autoFocus
        />
      )}
      <button
        type="button"
        className={`quiet icon-button${searching ? ' on' : ''}`}
        aria-label={searching ? 'Close search' : 'Search titles'}
        aria-expanded={searching}
        title={searching ? 'Close search' : 'Search titles'}
        // Closing the search also drops its text: text nobody can see must not go on filtering.
        onClick={() => change(searching ? { searchOpen: false, text: '' } : { searchOpen: true })}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3.5 3.5" />
        </svg>
      </button>
      <ActionMenu
        label="Filters"
        triggerClassName={`quiet icon-button${on > 0 ? ' on' : ''}`}
        triggerContent={
          <>
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 3.5h12L9.5 8.75V13l-3-1.5V8.75z" />
            </svg>
            {on > 0 && <span className="icon-count">{on}</span>}
          </>
        }
      >
        <div className="filter-menu">
          <label>
            Assignee
            <select
              value={filters.assignee}
              onChange={(e) => change({ assignee: e.target.value })}
              className={filters.assignee ? 'set' : ''}
            >
              <option value="">Anyone</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={filters.type}
              onChange={(e) => change({ type: e.target.value as TaskCategory | '' })}
              className={filters.type ? 'set' : ''}
            >
              <option value="">Any type</option>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TASK_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {boardItems && labels.length > 0 && (
            <label>
              Label
              <select
                value={filters.label}
                onChange={(e) => change({ label: e.target.value })}
                className={filters.label ? 'set' : ''}
              >
                <option value="">Any label</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {boardItems && (
            <label>
              Backlog item
              <select
                value={filters.itemId}
                onChange={(e) => change({ itemId: e.target.value })}
                className={filters.itemId ? 'set' : ''}
              >
                <option value="">Any item</option>
                {boardItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {boardItems && (
          <>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={filters.blocked}
                onChange={(e) => change({ blocked: e.target.checked })}
              />
              Blocked only
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={filters.outOfScope}
                onChange={(e) => change({ outOfScope: e.target.checked })}
              />
              Out of scope only
            </label>
          </>
        )}
        <p className="menu-note">Only for you, until you leave or reload.</p>
      </ActionMenu>
    </>
  );
}

/**
 * The line above the lanes. It is there only while the search or a filter hides cards: whenever
 * some are hidden, it says how many show and offers the way back to all of them.
 */
export function CardFilterRow({
  projectId,
  board,
  shown,
  total,
  noun,
}: {
  projectId: string;
  /** On the Workboard, which has two filters more than the Backlog. */
  board: boolean;
  shown: number;
  total: number;
  noun: string;
}) {
  const [filters, change] = useCardFilters(projectId);
  const active = board ? boardFiltersOn(filters) : backlogFiltersOn(filters);
  if (!active) return null;
  return (
    <p className="card-filters" role="status" data-testid="card-filters">
      <span>
        Showing {shown} of {total} {noun}. Reordering is off while filtering.
      </span>
      <button type="button" className="link" onClick={() => change(null)}>
        Clear filters
      </button>
    </p>
  );
}
