import { useState } from 'react';

/**
 * Specification Section 7: optional writing prompts are dismissible guidance, never required
 * fields or activation gates. Dismissal is remembered per browser.
 */
export function WritingPrompt({ id, children }: { id: string; children: React.ReactNode }) {
  const key = `gameweld.prompt.${id}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <aside className="prompt" role="note" data-testid={`prompt-${id}`}>
      <div>{children}</div>
      <button
        type="button"
        className="link"
        aria-label="Dismiss writing prompt"
        onClick={() => {
          try {
            localStorage.setItem(key, '1');
          } catch {
            /* private mode: dismiss for this page only */
          }
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </aside>
  );
}
