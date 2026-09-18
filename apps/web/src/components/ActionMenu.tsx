import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Native popovers escape scrolling lanes and supply outside-click and Escape dismissal. */
export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Node) || !popover.current?.contains(event.target)) {
        popover.current?.hidePopover();
      }
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  function toggle() {
    const panel = popover.current;
    const button = trigger.current;
    if (!panel || !button) return;
    if (panel.matches(':popover-open')) {
      panel.hidePopover();
      setOpen(false);
      return;
    }
    panel.showPopover();
    // `toggle` is queued by the browser; subscribe before an immediate scroll or resize.
    setOpen(true);
    const rect = button.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 8))}px`;
    panel.querySelector<HTMLElement>(':is(button, select, input):enabled, a[href]')?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="action-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="13" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="action-popover"
        role="group"
        aria-label={label}
        onToggle={(event) => setOpen(event.newState === 'open')}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-close-menu]')) {
            popover.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}
