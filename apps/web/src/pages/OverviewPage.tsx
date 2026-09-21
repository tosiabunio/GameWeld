import {
  CATEGORY_LABELS,
  MOSCOW_CATEGORIES,
  STATE_LABELS,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  type MoscowCategory,
  type OverviewItem,
  type ProjectOverview,
  type TaskProgress,
} from '@gameweld/domain';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t, tp } from '../i18n/index.ts';
import { bandedTreemap, squarify, type Rect } from '../treemap.ts';
import { useProject } from './ProjectPage.tsx';

const EMPTY: TaskProgress = {
  total: 0,
  completed: 0,
  inProgress: 0,
  toDo: 0,
  unplaced: 0,
  blocked: 0,
  overdue: 0,
  unassigned: 0,
};

function sum(progress: TaskProgress[]): TaskProgress {
  const total = { ...EMPTY };
  for (const p of progress)
    for (const key of Object.keys(total) as (keyof TaskProgress)[]) total[key] += p[key];
  return total;
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * The project at a glance: how many items and tasks there are and where they stand, how far each
 * priority and each kind of work is, and a map of the Backlog in which every item's area is its
 * number of tasks, its colour its priority, and its fill how far its tasks are.
 */
export function OverviewPage() {
  const { project, dataVersion } = useProject();
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Like every page, it follows what happens, by whoever's hand.
  useEffect(() => {
    api.overview(project.id).then(
      (o) => {
        setOverview(o);
        setError(null);
      },
      (e: unknown) => setError(e instanceof ApiError ? e.message : t('Something went wrong')),
    );
  }, [project.id, dataVersion]);

  if (!overview)
    return error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>;

  const tasks = sum(overview.items.map((i) => i.tasks));
  const items = overview.items;
  const inState = (state: OverviewItem['state']) => items.filter((i) => i.state === state).length;

  return (
    <div data-testid="overview">
      <header className="page-head">
        <p className="eyebrow">{t('At a glance')}</p>
        <h1>{t('Overview')}</h1>
        <p className="muted small">
          {t('{items} and {tasks}, not counting archived ones.', {
            items: `${items.length} ${tp(items.length, 'item')}`,
            tasks: `${tasks.total} ${tp(tasks.total, 'task')}`,
          })}
        </p>
      </header>

      <section className="stat-row" aria-label={t('Figures')}>
        <Stat
          label={t('Backlog items')}
          value={items.length}
          note={t('{done} done · {review} ready for review · {open} open', {
            done: inState('done'),
            review: inState('ready_for_review'),
            open: inState('open'),
          })}
        />
        <Stat
          label={t('Tasks complete')}
          value={`${percent(tasks.completed, tasks.total)}%`}
          note={t('{done} of {total}', { done: tasks.completed, total: tasks.total })}
        />
        <Stat
          label={t('In progress')}
          value={tasks.inProgress}
          note={t('On a Workboard, past To Do')}
        />
        <Stat
          label={t('Waiting')}
          value={tasks.toDo + tasks.unplaced}
          note={t('{todo} in To Do · {unplaced} on no board', {
            todo: tasks.toDo,
            unplaced: tasks.unplaced,
          })}
        />
        <Stat label={t('Blocked')} value={tasks.blocked} note={t('Flagged, not complete')} />
        <Stat label={t('Overdue')} value={tasks.overdue} note={t('Past their date')} />
        <Stat
          label={t('Unassigned')}
          value={tasks.unassigned}
          note={t('Not complete, nobody on it')}
        />
      </section>

      <div className="overview-grid">
        <section className="panel" aria-labelledby="by-priority">
          <h2 id="by-priority">{t('By priority')}</h2>
          <ul className="progress-rows">
            {MOSCOW_CATEGORIES.map((category) => {
              const ofCategory = items.filter((i) => i.category === category);
              const p = sum(ofCategory.map((i) => i.tasks));
              const count = (state: OverviewItem['state']) =>
                ofCategory.filter((i) => i.state === state).length;
              return (
                <li
                  key={category}
                  className={`hue-${category}`}
                  data-testid={`priority-${category}`}
                >
                  <div className="progress-row-head">
                    <span className="swatch" aria-hidden="true" />
                    <strong>{t(CATEGORY_LABELS[category])}</strong>
                    <span className="muted">
                      {ofCategory.length} {tp(ofCategory.length, 'item')}
                    </span>
                  </div>
                  <Meter part={p.completed} whole={p.total} />
                  <p className="muted small">
                    {t('{done} of {total} complete', { done: p.completed, total: p.total })} ·{' '}
                    {t('items: {done} done, {review} in review, {open} open', {
                      done: count('done'),
                      review: count('ready_for_review'),
                      open: count('open'),
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel" aria-labelledby="by-kind">
          <h2 id="by-kind">{t('Tasks by kind')}</h2>
          <ul className="progress-rows">
            {TASK_CATEGORIES.map((category) => {
              const p = overview.tasksByCategory[category];
              return (
                <li key={category} className={`hue-${category}`} data-testid={`kind-${category}`}>
                  <div className="progress-row-head">
                    <span className="swatch" aria-hidden="true" />
                    <strong>{t(TASK_CATEGORY_LABELS[category])}</strong>
                    <span className="muted">
                      {p.total} {tp(p.total, 'task')}
                    </span>
                  </div>
                  <Meter part={p.completed} whole={p.total} />
                  <p className="muted small">
                    {t('{done} complete · {progress} in progress · {waiting} waiting', {
                      done: p.completed,
                      progress: p.inProgress,
                      waiting: p.toDo + p.unplaced,
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <ProjectMap items={items} />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

/** How much of a whole is complete: the fill and its track are two steps of the row's hue. */
function Meter({ part, whole }: { part: number; whole: number }) {
  return (
    <div
      className="meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={whole}
      aria-valuenow={part}
      aria-valuetext={t('{done} of {total} complete', { done: part, total: whole })}
    >
      <span style={{ width: `${percent(part, whole)}%` }} />
    </div>
  );
}

// The map ------------------------------------------------------------------------------------

/** Room between neighbours, and between one priority's band and the next. */
const GAP = 2;
const BAND_GAP = 4;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current!;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const inset = (r: Rect, by: number): Rect => ({
  x: r.x + by,
  y: r.y + by,
  w: Math.max(0, r.w - 2 * by),
  h: Math.max(0, r.h - 2 * by),
});

function stateLabel(item: OverviewItem) {
  return t(STATE_LABELS[item.state]);
}

/** A description of an item on the map, for its tooltip and for screen readers. */
function describe(item: OverviewItem) {
  const p = item.tasks;
  if (p.total === 0) return t('No tasks yet');
  return [
    t('{done} of {total} complete', { done: p.completed, total: p.total }),
    p.inProgress && t('{n} in progress', { n: p.inProgress }),
    p.toDo + p.unplaced && t('{n} waiting', { n: p.toDo + p.unplaced }),
    p.blocked && t('{n} blocked', { n: p.blocked }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Every Backlog item as a rectangle whose area is its number of tasks (an item without tasks as
 * one), in bands by priority. The hue is the priority; the fill rises with the share of its tasks
 * complete, pale below, strong above, as on the meters. A full item waiting for review carries an
 * hourglass, an accepted one a tick.
 */
function ProjectMap({ items }: { items: OverviewItem[] }) {
  const [frame, width] = useWidth();
  const [hover, setHover] = useState<{ item: OverviewItem; x: number; y: number } | null>(null);
  const wide = width >= 700;
  const height = Math.round(
    // On a narrow screen the bands stack, and each needs height for its labels.
    wide ? Math.min(560, Math.max(340, width * 0.42)) : Math.min(960, Math.max(480, width * 1.7)),
  );

  const groups = MOSCOW_CATEGORIES.map((category) => ({
    key: category,
    items: items
      .filter((i) => i.category === category)
      .map((i) => ({ value: Math.max(1, i.tasks.total), data: i })),
  }));
  // Each band's items are laid out again inside its own margin, so priorities stand apart.
  const bands =
    width > 0
      ? bandedTreemap(groups, { x: 0, y: 0, w: width, h: height }).map((band) => ({
          ...band,
          cells: squarify(
            groups.find((g) => g.key === band.key)!.items,
            inset(band.band, BAND_GAP / 2),
          ),
        }))
      : [];
  const tasksIn = (category: MoscowCategory) =>
    items.filter((i) => i.category === category).reduce((n, i) => n + i.tasks.total, 0);

  return (
    <section className="panel project-map" aria-labelledby="project-map">
      <h2 id="project-map">{t('Project map')}</h2>
      <p className="muted small">
        {t(
          'Every Backlog item, its area the number of its tasks. The colour is its priority; the strong part, the share of its tasks complete.',
        )}
      </p>
      <ul className="map-legend" aria-label={t('Legend')}>
        {MOSCOW_CATEGORIES.map((category) => (
          <li key={category} className={`hue-${category}`}>
            <span className="swatch" aria-hidden="true" />
            {t(CATEGORY_LABELS[category])}{' '}
            <span className="muted">
              {tasksIn(category)} {tp(tasksIn(category), 'task')}
            </span>
          </li>
        ))}
        <li className="map-key" data-key="waiting">
          <span className="swatch" aria-hidden="true" />
          {t('Tasks not complete')}
        </li>
        <li className="map-key" data-key="complete">
          <span className="swatch" aria-hidden="true" />
          {t('Tasks complete')}
        </li>
        <li className="map-key" data-key="review">
          <span className="map-mark review" aria-hidden="true" />
          {t('Ready for Review')}
        </li>
        <li className="map-key" data-key="done">
          <span className="map-mark" aria-hidden="true">
            ✓
          </span>
          {t('Accepted as Done')}
        </li>
      </ul>

      <div
        ref={frame}
        className="map-frame"
        style={{ height }}
        data-testid="project-map"
        onPointerLeave={() => setHover(null)}
      >
        {bands.map((band) =>
          band.cells.map((cell) => {
            const item = cell.data;
            const r = inset(cell, GAP / 2);
            const labelled = r.w >= 64 && r.h >= 34;
            const marked = item.state !== 'open' && r.w >= 22 && r.h >= 22;
            const withMeta = labelled && r.h >= 54;
            const lines = Math.max(1, Math.floor((r.h - 12) / 16) - (withMeta ? 1 : 0));
            const style = {
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              '--done': `${percent(item.tasks.completed, item.tasks.total)}%`,
            } as CSSProperties;
            return (
              <Link
                key={item.id}
                to={`../breakdown/${item.id}`}
                className={`map-cell hue-${item.category} state-${item.state}${
                  item.tasks.total === 0 ? ' empty' : ''
                }${marked ? ' marked' : ''}`}
                style={style}
                data-testid="map-cell"
                data-tasks={item.tasks.total}
                aria-label={`${item.title}: ${t(CATEGORY_LABELS[item.category])}, ${stateLabel(item)}. ${describe(item)}`}
                onPointerMove={(e) => {
                  const box = frame.current!.getBoundingClientRect();
                  setHover({ item, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onFocus={() => setHover({ item, x: r.x + r.w / 2, y: r.y + r.h })}
                onBlur={() => setHover(null)}
              >
                {labelled && (
                  <>
                    <span className="map-title" style={{ WebkitLineClamp: lines }}>
                      {item.title}
                    </span>
                    {withMeta && (
                      <span className="map-meta">
                        {item.tasks.total
                          ? `${item.tasks.completed}/${item.tasks.total}`
                          : t('No tasks yet')}
                      </span>
                    )}
                  </>
                )}
                {marked && item.state === 'done' && (
                  <span className="map-mark" aria-hidden="true">
                    ✓
                  </span>
                )}
                {marked && item.state === 'ready_for_review' && (
                  <span className="map-mark review" aria-hidden="true" />
                )}
              </Link>
            );
          }),
        )}
        {hover && <MapTooltip {...hover} width={width} height={height} />}
      </div>

      <details className="map-table">
        <summary>{t('Show the map as a table')}</summary>
        <table className="table">
          <thead>
            <tr>
              <th>{t('Item')}</th>
              <th>{t('Priority')}</th>
              <th>{t('State')}</th>
              <th className="number">{t('Tasks')}</th>
              <th className="number">{t('Complete')}</th>
              <th className="number">{t('In progress')}</th>
              <th className="number">{t('Waiting')}</th>
              <th className="number">{t('Blocked')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`../breakdown/${item.id}`}>{item.title}</Link>
                </td>
                <td>{t(CATEGORY_LABELS[item.category])}</td>
                <td>{stateLabel(item)}</td>
                <td className="number">{item.tasks.total}</td>
                <td className="number">{item.tasks.completed}</td>
                <td className="number">{item.tasks.inProgress}</td>
                <td className="number">{item.tasks.toDo + item.tasks.unplaced}</td>
                <td className="number">{item.tasks.blocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** What the map says about one item, kept inside the map wherever the pointer is. */
function MapTooltip({
  item,
  x,
  y,
  width,
  height,
}: {
  item: OverviewItem;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const left = Math.min(Math.max(8, x + 12), Math.max(8, width - 248));
  const top = y + 16 + 110 > height ? Math.max(8, y - 120) : y + 16;
  return (
    <div className="map-tooltip" role="tooltip" style={{ left, top }} data-testid="map-tooltip">
      <strong>{item.title}</strong>
      <span className="muted small">
        {t(CATEGORY_LABELS[item.category])} · {stateLabel(item)}
        {item.onBoard ? ` · ${t('on the Workboard')}` : ''}
      </span>
      <span className="small">{describe(item)}</span>
    </div>
  );
}
