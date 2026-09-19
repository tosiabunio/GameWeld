import type { ChecklistItem, UpdateChecklistItemInput } from '@gameweld/domain';
import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { t } from '../i18n/index.ts';

/** Progress of a task's checklist, as cards show it when the task has one. */
export function ChecklistProgress({ checklist }: { checklist: { total: number; done: number } }) {
  if (checklist.total === 0) return null;
  const all = checklist.done === checklist.total;
  return (
    <span
      className={`checklist-progress${all ? ' all' : ''}`}
      title={t('Checklist: {done} of {total} done', {
        done: checklist.done,
        total: checklist.total,
      })}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
        <rect
          x="1.75"
          y="1.75"
          width="12.5"
          height="12.5"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="m4.75 8.25 2.25 2.25 4.25-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{t('Checklist')} </span>
      {checklist.done}/{checklist.total}
    </span>
  );
}

/**
 * The checklist in a task's window: the small steps of one piece of work. Ticking them is a
 * convenience for whoever does the task and decides nothing about its completion.
 */
export function Checklist({
  items,
  canEdit,
  onAdd,
  onUpdate,
  onRemove,
}: {
  items: ChecklistItem[];
  canEdit: boolean;
  onAdd: (titles: string[]) => Promise<boolean>;
  onUpdate: (id: string, input: UpdateChecklistItemInput) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  // A tick shows at once and the server's word replaces it, so the box never jumps back while
  // the request is on its way.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  useEffect(() => setTicked({}), [items]);
  const isDone = (item: ChecklistItem) => ticked[item.id] ?? item.done;
  const done = items.filter(isDone).length;
  if (items.length === 0 && !canEdit) return null;

  const add = (titles: string[]) => {
    const wanted = titles.map((title) => title.trim()).filter((title) => title !== '');
    if (wanted.length > 0) void onAdd(wanted).then((ok) => ok && setDraft(''));
  };
  /** A pasted list becomes one item per line, without the bullets or boxes it may carry. */
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData.getData('text').split(/\r?\n/);
    if (lines.filter((l) => l.trim() !== '').length < 2) return;
    e.preventDefault();
    add(lines.map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, '')));
  };

  return (
    <section className="checklist" aria-labelledby="checklist-heading" data-testid="checklist">
      <div className="row between">
        <h2 id="checklist-heading">{t('Checklist')}</h2>
        {items.length > 0 && (
          <span className="muted small" data-testid="checklist-count">
            {done}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <progress value={done} max={items.length} aria-label={t('Checklist progress')} />
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={isDone(item) ? 'done' : undefined}>
            <input
              type="checkbox"
              checked={isDone(item)}
              disabled={!canEdit}
              onChange={(e) => {
                const next = e.target.checked;
                setTicked((was) => ({ ...was, [item.id]: next }));
                void onUpdate(item.id, { done: next }).then(
                  (ok) => ok || setTicked((was) => ({ ...was, [item.id]: item.done })),
                );
              }}
              aria-label={item.title}
            />
            {renaming?.id === item.id ? (
              <form
                aria-label={t('Rename {title}', { title: item.title })}
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  const title = renaming.title.trim();
                  if (title === '' || title === item.title) return setRenaming(null);
                  void onUpdate(item.id, { title }).then((ok) => ok && setRenaming(null));
                }}
              >
                <input
                  value={renaming.title}
                  onChange={(e) => setRenaming({ id: item.id, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return;
                    // Only the rename ends; the window around it stays.
                    e.preventDefault();
                    e.stopPropagation();
                    setRenaming(null);
                  }}
                  onBlur={() => setRenaming(null)}
                  maxLength={500}
                  aria-label={t('Item text')}
                  autoFocus
                />
              </form>
            ) : canEdit ? (
              <button
                type="button"
                className="checklist-title"
                title={t('Click to rename')}
                onClick={() => setRenaming({ id: item.id, title: item.title })}
              >
                {item.title}
              </button>
            ) : (
              <span className="checklist-title">{item.title}</span>
            )}
            {canEdit && (
              <button
                type="button"
                className="quiet checklist-remove"
                aria-label={t('Remove {title}', { title: item.title })}
                title={t('Remove')}
                onClick={() => void onRemove(item.id)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="add-item"
          aria-label={t('Add checklist item')}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add([draft]);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            placeholder={t('Add a step… (paste a list to add several)')}
            aria-label={t('New checklist item')}
            maxLength={500}
          />
          <button type="submit" disabled={draft.trim() === ''}>
            {t('Add')}
          </button>
        </form>
      )}
    </section>
  );
}
