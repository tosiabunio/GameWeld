import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Avatar, NobodyAvatar } from './Brand.tsx';

const MENU_WIDTH = 240;
const GAP = 6;

/**
 * The assignee's avatar, or a "?" when nobody is assigned. For those who may assign, clicking it
 * lists the project's members and a pick applies at once.
 *
 * The menu is portalled to the body: the lanes scroll and dragged cards are transformed, and
 * either would clip or displace a menu positioned inside the card. React still bubbles its events
 * through the card, so the menu stops pointer and key events from reaching the card's drag
 * handlers.
 */
export function AssigneePicker({
  assignee,
  people,
  taskTitle,
  onAssign,
}: {
  assignee: { id: string; displayName: string } | null;
  people: { userId: string; displayName: string }[];
  taskTitle: string;
  /** Omit when the viewer may not assign; the avatar is then only shown. */
  onAssign?: ((userId: string | null) => Promise<unknown>) | undefined;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const open = position !== null;
  const label = assignee ? `Assigned to ${assignee.displayName}` : 'Unassigned';
  const face = assignee ? (
    <Avatar name={assignee.displayName} size={24} />
  ) : (
    <NobodyAvatar size={24} />
  );

  function close(refocus: boolean) {
    setPosition(null);
    if (refocus) trigger.current?.focus();
  }

  function toggle() {
    if (open) return close(false);
    const r = trigger.current!.getBoundingClientRect();
    setPosition({
      top: r.bottom + GAP,
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }

  // Open above the avatar when there is no room below, then focus the current choice.
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const height = menu.current.offsetHeight;
    const r = trigger.current.getBoundingClientRect();
    if (r.bottom + GAP + height > window.innerHeight - 8 && r.top - GAP - height > 8) {
      setPosition((p) => p && { ...p, top: r.top - GAP - height });
    }
    const current = menu.current.querySelector<HTMLElement>('[aria-checked="true"]');
    (current ?? menu.current.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }, [open]);

  // A press outside, a scroll of the page or lanes, or a resize dismisses the menu.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    const scrolled = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    const resized = () => close(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', resized);
    };
  }, [open]);

  function onMenuKey(e: KeyboardEvent) {
    e.stopPropagation();
    const items = Array.from(menu.current!.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') focus(at + 1);
    else if (e.key === 'ArrowUp') focus(at - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') close(true);
    else return;
    e.preventDefault();
  }

  async function pick(userId: string | null) {
    close(true);
    if (!onAssign || userId === (assignee?.id ?? null)) return;
    setBusy(true);
    await onAssign(userId);
    setBusy(false);
  }

  if (!onAssign) {
    return (
      <span
        className="assignee"
        role="img"
        aria-label={label}
        title={label}
        data-testid="card-assignee"
      >
        {face}
      </span>
    );
  }

  const choice = (userId: string | null, name: string, avatar: ReactNode) => {
    const checked = (assignee?.id ?? null) === userId;
    return (
      <button
        key={userId ?? 'nobody'}
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        tabIndex={-1}
        onClick={() => void pick(userId)}
      >
        {avatar}
        <span className="name">{name}</span>
        {checked && (
          <span className="check" aria-hidden="true">
            ✓
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`assignee${busy ? ' busy' : ''}`}
        aria-label={`Assignee of ${taskTitle}: ${assignee?.displayName ?? 'nobody'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label}. Click to change.`}
        data-testid="card-assignee"
        disabled={busy}
        onClick={toggle}
        // Pressing the avatar picks a person; it never starts dragging the card.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {face}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Assign ${taskTitle}`}
            className="assignee-menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            onKeyDown={onMenuKey}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {choice(null, 'Unassigned', <NobodyAvatar size={22} />)}
            {people.map((p) =>
              choice(p.userId, p.displayName, <Avatar name={p.displayName} size={22} />),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
