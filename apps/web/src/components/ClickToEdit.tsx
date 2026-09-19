import type { ReactNode } from 'react';
import { isCardClick } from '../taskLinks.ts';

/**
 * Text that is edited where it stands: a click on it starts the edit, with no detour through an
 * "Edit" button. A title is a button, so the keyboard reaches it too; a pencil shows on hover
 * and focus, as on the Workboard's name.
 */
export function EditableTitle({
  children,
  label,
  onEdit,
}: {
  children: ReactNode;
  label: string;
  onEdit: () => void;
}) {
  return (
    <button type="button" className="title-edit" title={label} onClick={onEdit}>
      {children}{' '}
      <span className="pencil" aria-hidden="true">
        ✎
      </span>
    </button>
  );
}

/**
 * A block of rendered text that a click turns into its editor. Links and mentions inside it
 * keep their own clicks, and selecting text to copy it is not a click; the rule is the cards'.
 * It holds links, so it cannot be a button itself: the keyboard's way in is the "Edit" button
 * that stays beside the title.
 */
export function EditableText({
  children,
  label,
  onEdit,
}: {
  children: ReactNode;
  label: string;
  onEdit: () => void;
}) {
  return (
    <div className="text-edit" title={label} onClick={(e) => isCardClick(e) && onEdit()}>
      {children}
    </div>
  );
}
