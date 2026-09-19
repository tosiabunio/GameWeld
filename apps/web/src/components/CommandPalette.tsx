import type { ProjectSummary, SearchResults } from '@gameweld/domain';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../api.ts';
import { t } from '../i18n/index.ts';
import type { TaskLinkState } from '../taskLinks.ts';

interface Entry {
  key: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
  state?: TaskLinkState;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

/**
 * Quick open, on Cmd+K (Ctrl+K elsewhere) or its button in the top bar: a few letters find a
 * backlog item or a task of the open project, a section of it, or another project, and Enter
 * goes there. A task opens in its window over the page the viewer is on.
 */
export function CommandPalette() {
  const { projectId } = useParams<{ projectId?: string }>();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [found, setFound] = useState<SearchResults>({ items: [], tasks: [] });
  const [chosen, setChosen] = useState(0);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey)
        return;
      e.preventDefault();
      setOpen((was) => !was);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    setQuery('');
    setChosen(0);
    void api.projects().then(setProjects, () => undefined);
    return () => element.close();
  }, [open]);

  // What was typed, looked up in the open project once the typing pauses.
  useEffect(() => {
    const q = query.trim();
    if (!open || !projectId || q === '') return setFound({ items: [], tasks: [] });
    let current = true;
    const timer = window.setTimeout(() => {
      void api.search(projectId, q).then(
        (results) => current && setFound(results),
        () => undefined,
      );
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, projectId, query]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (label: string) => q === '' || label.toLowerCase().includes(q);
    const list: Entry[] = [];
    if (projectId) {
      const base = `/projects/${projectId}`;
      // A task opens over this page, unless this page is itself a task's.
      const over: TaskLinkState | undefined = pathname.startsWith(`${base}/tasks/`)
        ? undefined
        : { background: { pathname, search, hash } };
      for (const task of found.tasks)
        list.push({
          key: `task:${task.id}`,
          group: t('Tasks'),
          label: task.title,
          hint: `${task.itemTitle}${task.completed ? ` · ${t('complete')}` : ''}`,
          to: `${base}/tasks/${task.id}`,
          ...(over ? { state: over } : {}),
        });
      for (const item of found.items)
        list.push({
          key: `item:${item.id}`,
          group: t('Backlog items'),
          label: item.title,
          ...(item.state === 'open'
            ? {}
            : { hint: item.state === 'done' ? t('accepted') : t('ready for review') }),
          to: `${base}/breakdown/${item.id}`,
        });
      for (const [name, path] of [
        ['Backlog', 'backlog'],
        ['Breakdown', 'breakdown'],
        ['Workboard', 'board'],
        ['My tasks', 'my-tasks'],
        ['Project settings', 'settings'],
      ] as const) {
        // Found by the name the viewer reads, which is the one in their language.
        const label = t(name);
        if (matches(label))
          list.push({ key: `go:${path}`, group: t('Go to'), label, to: `${base}/${path}` });
      }
    }
    for (const p of projects)
      if (p.id !== projectId && matches(p.name))
        list.push({
          key: `project:${p.id}`,
          group: t('Projects'),
          label: p.name,
          to: `/projects/${p.id}`,
        });
    if (matches(t('All projects')))
      list.push({ key: 'go:projects', group: t('Projects'), label: t('All projects'), to: '/' });
    return list;
  }, [query, projectId, projects, found, pathname, search, hash]);

  useEffect(() => setChosen(0), [entries.length, query]);

  function go(entry: Entry) {
    setOpen(false);
    void navigate(entry.to, entry.state ? { state: entry.state } : undefined);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setChosen((at) => (at + step + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = entries[chosen];
      if (entry) go(entry);
    } else if (e.key === 'Escape') {
      // A search field would spend the first Escape on clearing its text.
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="quiet palette-button"
        onClick={() => setOpen(true)}
        aria-label={t('Quick open ({shortcut})', { shortcut: SHORTCUT })}
        title={t('Quick open ({shortcut})', { shortcut: SHORTCUT })}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3.5 3.5" />
        </svg>
        <kbd>{SHORTCUT}</kbd>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="palette"
          aria-label={t('Quick open')}
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              projectId ? t('Find a task, an item, a section, a project…') : t('Find a project…')
            }
            aria-label={t('Quick open')}
            aria-controls="palette-results"
            autoFocus
          />
          <ul id="palette-results" role="listbox" aria-label={t('Results')}>
            {entries.map((entry, index) => (
              <li key={entry.key} role="presentation">
                {entries[index - 1]?.group !== entry.group && (
                  <span className="palette-group">{entry.group}</span>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === chosen}
                  className={index === chosen ? 'chosen' : undefined}
                  onMouseMove={() => setChosen(index)}
                  onClick={() => go(entry)}
                  tabIndex={-1}
                >
                  <span className="palette-label">{entry.label}</span>
                  {entry.hint && <span className="palette-hint">{entry.hint}</span>}
                </button>
              </li>
            ))}
            {entries.length === 0 && <li className="palette-empty">{t('Nothing found.')}</li>}
          </ul>
        </dialog>
      )}
    </>
  );
}
