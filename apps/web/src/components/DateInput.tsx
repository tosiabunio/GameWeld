import { useEffect, useRef, useState } from 'react';

/** A year typed to its fourth digit: until then the browser reports 0002, 0020, 0202. */
export const isWholeDate = (value: string): boolean => /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value);

/** How long the field waits after the last key before saving a whole date. */
const SETTLE_MS = 500;

/**
 * A date field that saves a date once it is whole and typing has paused. A browser's date field
 * reports a change at every key: while a year is typed, each stage is a date of its own, in the
 * first centuries; a day typed as two digits is first the day of its first digit; and while a
 * part is being replaced, the field is empty. Saving each of those wrote dates nobody meant into
 * the history, and answered the second with a conflict. Here what is typed stays in the field. A
 * whole date is saved after a moment without a key, or at once when the field is left; an emptied
 * field is saved, as no date, when it is left.
 */
export function DateInput({
  value,
  onCommit,
  disabled = false,
}: {
  /** The saved date, YYYY-MM-DD, or null for none. */
  value: string | null;
  /** Saves the date; an answer of false means it was not saved, and the field goes back. */
  onCommit: (value: string | null) => Promise<boolean> | void;
  disabled?: boolean;
}) {
  const saved = value ?? '';
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);

  // What the timer and the unmount see: the latest of each, not those of the render they began in.
  const latest = useRef({ saved, onCommit });
  latest.current = { saved, onCommit };
  const waiting = useRef<{ timer: ReturnType<typeof setTimeout>; date: string } | null>(null);

  const commit = (next: string) => {
    if (next === latest.current.saved) return;
    void Promise.resolve(latest.current.onCommit(next || null)).then((ok) => {
      if (ok === false) setDraft(latest.current.saved);
    });
  };
  /** Saves now what was waiting for a pause, if anything. */
  const flush = () => {
    if (!waiting.current) return;
    clearTimeout(waiting.current.timer);
    const { date } = waiting.current;
    waiting.current = null;
    commit(date);
  };
  // A date picked just before the field goes away (its menu or window closes) is still saved.
  useEffect(() => flush, []);

  return (
    <input
      type="date"
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (waiting.current) clearTimeout(waiting.current.timer);
        waiting.current = isWholeDate(next)
          ? { date: next, timer: setTimeout(flush, SETTLE_MS) }
          : null;
      }}
      onBlur={() => {
        flush();
        // Empty on leaving means no date. A date left unfinished is given up.
        if (draft === '') commit('');
        else if (!isWholeDate(draft)) setDraft(latest.current.saved);
      }}
    />
  );
}
