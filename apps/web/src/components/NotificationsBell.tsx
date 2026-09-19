import type { Notification, NotificationSummary, WaitingEntry } from '@gameweld/domain';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../api.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { Avatar } from './Brand.tsx';

/** How often the bell looks again while the page just sits there. */
const POLL_MS = 60_000;

/**
 * The bell in the top bar. It counts what waits for the viewer's decision (placement requests to
 * decide, items to accept: states, which stay until someone decides) together with what they
 * have not read yet (events), and opens both. Until the app has live updates it looks again
 * every minute, on every move between pages, and when the window comes back into view.
 */
export function NotificationsBell() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const { pathname } = useLocation();

  const reload = useCallback(async () => {
    try {
      setSummary(await api.notifications());
    } catch {
      // The bell keeps what it last knew; the page itself reports real trouble.
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, pathname]);
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  async function markRead(ids?: string[]) {
    // At once in what is shown; the next look brings the server's word.
    setSummary((was) =>
      was
        ? {
            ...was,
            unread: ids ? Math.max(0, was.unread - ids.length) : 0,
            notifications: was.notifications.map((n) =>
              !ids || ids.includes(n.id) ? { ...n, read: true } : n,
            ),
          }
        : was,
    );
    try {
      await api.markNotificationsRead(ids ? { ids } : {});
    } finally {
      void reload();
    }
  }

  const waiting = summary?.waiting ?? [];
  const notifications = summary?.notifications ?? [];
  const count = waiting.length + (summary?.unread ?? 0);
  const label =
    count === 0
      ? 'Notifications'
      : `Notifications: ${waiting.length} waiting for you, ${summary?.unread ?? 0} unread`;

  return (
    <ActionMenu
      label={label}
      triggerClassName={`quiet icon-button bell${count > 0 ? ' on' : ''}`}
      popoverClassName="notifications-popover"
      onOpen={() => void reload()}
      triggerContent={
        <>
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 11V7a4 4 0 0 1 8 0v4l1.25 1.5H2.75z" />
            <path d="M6.5 14a1.6 1.6 0 0 0 3 0" />
          </svg>
          {count > 0 && (
            <span className="icon-count" data-testid="notification-count">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      }
    >
      <div className="notifications" data-testid="notifications">
        {waiting.length > 0 && (
          <section aria-labelledby="waiting-heading">
            <h3 id="waiting-heading">Waiting for you</h3>
            <ul>
              {waiting.map((entry) => (
                <li key={`${entry.kind}:${entry.task?.id ?? entry.item.id}`}>
                  <WaitingRow entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="notifications-heading">
          <div className="row between">
            <h3 id="notifications-heading">Notifications</h3>
            {(summary?.unread ?? 0) > 0 && (
              <button type="button" className="link" onClick={() => void markRead()}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="muted small">
              Nothing yet. You will hear when a task is given to you, someone comments on your work,
              or a decision you asked for is made.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className={n.read ? undefined : 'unread'}>
                  <NotificationRow notification={n} onOpen={() => void markRead([n.id])} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ActionMenu>
  );
}

function WaitingRow({ entry }: { entry: WaitingEntry }) {
  const project = `/projects/${entry.project.id}`;
  return entry.kind === 'request' ? (
    <Link to={`${project}/board`} data-close-menu className="notification">
      <span className="notification-system waiting" aria-hidden="true" />
      <span className="notification-text">
        <strong>{entry.requester?.displayName}</strong> asks to place{' '}
        <strong>{entry.task?.title}</strong> on the Workboard
      </span>
      <span className="notification-meta">
        {entry.item.title} · {entry.project.name} · {ago(entry.since)}
      </span>
    </Link>
  ) : (
    <Link to={`${project}/breakdown/${entry.item.id}`} data-close-menu className="notification">
      <span className="notification-system waiting" aria-hidden="true" />
      <span className="notification-text">
        <strong>{entry.item.title}</strong> is ready for review
      </span>
      <span className="notification-meta">
        {entry.project.name} · {ago(entry.since)}
      </span>
    </Link>
  );
}

function NotificationRow({
  notification: n,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const project = `/projects/${n.project.id}`;
  // A task opens in its window; without the page it was opened from, the app picks the task's own.
  const to = n.kind.startsWith('request.')
    ? n.kind === 'request.created' || !n.task
      ? `${project}/board`
      : `${project}/tasks/${n.task.id}`
    : n.task
      ? `${project}/tasks/${n.task.id}`
      : n.item
        ? `${project}/breakdown/${n.item.id}`
        : project;
  const who = n.actor?.displayName ?? 'GameWeld';
  const task = <strong>{n.task?.title ?? 'a task'}</strong>;
  const item = <strong>{n.item?.title ?? 'an item'}</strong>;
  return (
    <Link to={to} data-close-menu className="notification" onClick={onOpen}>
      {n.actor ? (
        <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} size={22} />
      ) : (
        <span className="notification-system" aria-hidden="true" />
      )}
      <span className="notification-text">
        {n.kind === 'task.assigned' && (
          <>
            <strong>{who}</strong> assigned {task} to you
          </>
        )}
        {n.kind === 'task.unassigned' && (
          <>
            <strong>{who}</strong> took {task} off your hands
          </>
        )}
        {n.kind === 'comment.added' && (
          <>
            <strong>{who}</strong> commented on {n.task ? task : item}
          </>
        )}
        {n.kind === 'request.created' && (
          <>
            <strong>{who}</strong> asks to place {task} on the Workboard
          </>
        )}
        {n.kind === 'request.approved' && <>Your request to place {task} was approved</>}
        {n.kind === 'request.rejected' && <>Your request to place {task} was rejected</>}
        {n.kind === 'item.ready_for_review' && <>{item} is ready for review</>}
        {n.kind === 'item.accepted' && (
          <>
            <strong>{who}</strong> accepted {item}
          </>
        )}
        {n.kind === 'item.rejected' && (
          <>
            <strong>{who}</strong> sent {item} back from review
          </>
        )}
        {n.detail && <span className="notification-detail">“{n.detail}”</span>}
      </span>
      <span className="notification-meta">
        {n.project.name} · {ago(n.createdAt)}
        {!n.read && <span className="sr-only"> · unread</span>}
      </span>
    </Link>
  );
}

/** "5 min ago", "3 h ago", then the date. */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}
