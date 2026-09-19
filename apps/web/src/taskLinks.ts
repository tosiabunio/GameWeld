import { useMemo, type MouseEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';

/**
 * A task opens in a window over the page it was opened from. The task keeps its own address, so
 * its link carries that page along for the router to keep showing underneath.
 */
export interface TaskLinkState {
  background: Pick<Location, 'pathname' | 'search' | 'hash'>;
  /** The address was opened directly and the page underneath was chosen for it: no way back. */
  direct?: boolean;
}

export function useTaskLinks(projectId: string) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  return useMemo(() => {
    const state: TaskLinkState = { background: { pathname, search, hash } };
    const to = (taskId: string) => `/projects/${projectId}/tasks/${taskId}`;
    return {
      /** Props for a `Link` to the task. */
      link: (taskId: string) => ({ to: to(taskId), state }),
      open: (taskId: string) => navigate(to(taskId), { state }),
    };
  }, [projectId, pathname, search, hash, navigate]);
}

const OWN_JOB =
  'a, button, input, select, textarea, label, summary, form, [role="menu"], [role="group"], [popover]';

/**
 * Whether a click on a card is a click on the card: not on a link, button, menu, or confirmation
 * inside it, not the end of a text selection, and not a modified click. A drag never gets here,
 * because dnd-kit swallows the click that ends one.
 */
export function isCardClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const card = event.currentTarget;
  const target = event.target;
  // React lets a click in a portal, such as the assignee menu, bubble to the card that owns it.
  if (!(target instanceof Element) || !card.contains(target)) return false;
  const inner = target.closest(OWN_JOB);
  if (inner && card.contains(inner)) return false;
  return (window.getSelection()?.toString() ?? '') === '';
}
