import type { ItemLink } from '@gameweld/domain';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api.ts';

/** External links on an item or task. Adding and removing is wired by the parent. */
export function LinksList({
  links,
  canEdit,
  onAdd,
  onRemove,
}: {
  links: ItemLink[];
  canEdit: boolean;
  onAdd: (url: string, label: string) => Promise<unknown>;
  onRemove: (linkId: string) => Promise<unknown>;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return false;
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {links.length === 0 ? (
        <p className="muted small">No links yet.</p>
      ) : (
        <ul className="links">
          {links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label || l.url}
              </a>
              {canEdit && (
                <button
                  type="button"
                  className="link"
                  onClick={() => void run(() => onRemove(l.id))}
                  aria-label={`Remove link ${l.label || l.url}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="form inline"
          aria-label="Add link"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => onAdd(url.trim(), label.trim())).then((ok) => {
              if (ok) {
                setUrl('');
                setLabel('');
              }
            });
          }}
        >
          <label>
            URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              required
            />
          </label>
          <label>
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional"
              maxLength={200}
            />
          </label>
          <button type="submit" disabled={url.trim() === ''}>
            Add link
          </button>
        </form>
      )}
    </>
  );
}
