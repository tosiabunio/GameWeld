import { useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { useProject } from '../pages/ProjectPage.tsx';

/** "@" at the start or after a space, then the letters typed so far, up to the caret. */
const TRIGGER = /(^|\s)@([^\s@]{0,30})$/;
const SHOWN = 6;

/**
 * A textarea for Markdown that suggests the project's members after "@". A mention stays in the
 * text as it reads, "@Devin Developer": the name is what ties it to the member, both where the
 * text is shown and where the server decides whom to tell.
 */
export function MentionTextarea({
  value,
  onChange,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const { project } = useProject();
  const field = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [chosen, setChosen] = useState(0);

  const matches =
    query === null
      ? []
      : project.members
          .filter((m) =>
            m.displayName
              .toLowerCase()
              .split(/\s+/)
              .concat(m.displayName.toLowerCase())
              .some((part) => part.startsWith(query.toLowerCase())),
          )
          .slice(0, SHOWN);

  function look(text: string, caret: number) {
    const found = TRIGGER.exec(text.slice(0, caret));
    setQuery(found ? found[2]! : null);
    setChosen(0);
  }

  function pick(displayName: string) {
    const element = field.current!;
    const caret = element.selectionStart;
    const start = value.slice(0, caret).lastIndexOf('@');
    const inserted = `@${displayName} `;
    onChange(value.slice(0, start) + inserted + value.slice(caret));
    setQuery(null);
    // After React has written the new text, put the caret behind the name.
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    rest.onKeyDown?.(event);
    if (matches.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setChosen((at) => (at + step + matches.length) % matches.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(matches[chosen]!.displayName);
    } else if (event.key === 'Escape') {
      // Only the suggestions close; the window the field may be in stays.
      event.preventDefault();
      event.stopPropagation();
      setQuery(null);
    }
  }

  return (
    <span className="mention-field">
      <textarea
        {...rest}
        ref={field}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          look(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => look(value, e.currentTarget.selectionStart)}
        onBlur={(e) => {
          rest.onBlur?.(e);
          setQuery(null);
        }}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length > 0 && (
        <span className="mention-suggestions" role="listbox" aria-label="Mention a member">
          {matches.map((m, index) => (
            <span
              key={m.userId}
              role="option"
              aria-selected={index === chosen}
              className={index === chosen ? 'chosen' : undefined}
              // Before the blur that a click would cause, which closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m.displayName);
              }}
            >
              {m.displayName}
            </span>
          ))}
        </span>
      )}
      {!rest.readOnly && (
        <span className="hint">
          Markdown works here: **bold**, lists, links. Type @ to mention someone.
        </span>
      )}
    </span>
  );
}
