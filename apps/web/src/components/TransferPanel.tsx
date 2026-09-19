import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategory } from '@gameweld/domain';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError, type TrelloImportMode, type TrelloImportResult } from '../api.ts';
import { t, tj, tp } from '../i18n/index.ts';
import { useProject } from '../pages/ProjectPage.tsx';

/**
 * Taking the project's data out, and bringing a Trello board in. Both are a Game Director's: an
 * export holds everything in the project, and an import adds to everyone's Backlog.
 */
export function TransferPanel() {
  const { project, notifyChanged } = useProject();
  const [mode, setMode] = useState<TrelloImportMode>('cards_as_tasks');
  const [category, setCategory] = useState<TaskCategory>('code');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TrelloImportResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      let board: unknown;
      try {
        board = JSON.parse(await file.text());
      } catch {
        throw new ApiError(
          400,
          t(
            'That file is not JSON. In Trello: board menu → Print, export, and share → Export as JSON.',
          ),
        );
      }
      setDone(await api.importTrello(project.id, { mode, category, board }));
      notifyChanged();
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The import failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="transfer-heading">
      <h2 id="transfer-heading">{t('Import and export')}</h2>

      <h3>{t('Export')}</h3>
      <p className="muted">
        {t(
          'Everything in the project as one JSON document: settings, members, labels, items, tasks with their checklists, comments and links, Workboards, requests, and the whole activity history. Attachments are listed by name; the files stay here. Or the tasks alone, one per row, for a spreadsheet.',
        )}
      </p>
      <div className="row">
        <a className="button" href={api.exportUrl(project.id, 'json')} download>
          {t('Export the project (JSON)')}
        </a>
        <a className="button" href={api.exportUrl(project.id, 'csv')} download>
          {t('Export the tasks (CSV)')}
        </a>
      </div>

      <h3>{t('Import from Trello')}</h3>
      <p className="muted">
        {t(
          'In Trello, open the board’s menu, then “Print, export, and share”, then “Export as JSON”. Archived lists and cards are left out. Everything arrives in the Backlog under Should Have, unplaced: what enters a Workboard is decided here. Card members are not brought over.',
        )}
      </p>
      <form className="form" aria-label={t('Import from Trello')} onSubmit={submit}>
        <fieldset className="choices">
          <legend>{t('A Trello card becomes')}</legend>
          <label className="check">
            <input
              type="radio"
              name="trello-mode"
              checked={mode === 'cards_as_tasks'}
              onChange={() => setMode('cards_as_tasks')}
            />
            <span>
              {tj(
                '<1>a task.</1> Each list becomes a backlog item holding its cards, which keep their labels, date, checklists, comments, and links.',
                undefined,
                { 1: (s) => <strong>{s}</strong> },
              )}
            </span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="trello-mode"
              checked={mode === 'cards_as_items'}
              onChange={() => setMode('cards_as_items')}
            />
            <span>
              {tj(
                '<1>a backlog item.</1> The entries of its checklists become its tasks; its labels and date are written into its description.',
                undefined,
                { 1: (s) => <strong>{s}</strong> },
              )}
            </span>
          </label>
        </fieldset>
        <label>
          {t('Category of the tasks')}
          <select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(TASK_CATEGORY_LABELS[c])}
              </option>
            ))}
          </select>
          <span className="hint">
            {t('Used unless a card’s label names a kind of work, such as “Art” or “Code”.')}
          </span>
        </label>
        <label>
          {t('Trello export')}
          <input
            type="file"
            accept="application/json,.json"
            // Choosing the same file again after an error must count as a choice.
            key={done ? 'after' : 'before'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="notice info" role="status" data-testid="import-result">
            {t('Imported {items} and {tasks}', {
              items: `${done.items} ${tp(done.items, 'backlog item')}`,
              tasks: `${done.tasks} ${tp(done.tasks, 'task')}`,
            })}
            {done.labels > 0 && `, ${done.labels} ${tp(done.labels, 'new label')}`}
            {/* English says "entries" whatever the count; the noun is its own key. */}
            {done.checklistItems > 0 &&
              `, ${done.checklistItems} ${tp(done.checklistItems, 'checklist entries', 'checklist entries')}`}
            {done.comments > 0 && `, ${done.comments} ${tp(done.comments, 'comment')}`}
            {done.links > 0 && `, ${done.links} ${tp(done.links, 'link')}`}.{' '}
            <Link to={`/projects/${project.id}/backlog`}>{t('Open the Backlog')}</Link>
          </p>
        )}
        <div>
          <button type="submit" className="primary" disabled={!file || busy}>
            {busy ? t('Importing…') : t('Import')}
          </button>
        </div>
      </form>
    </section>
  );
}
