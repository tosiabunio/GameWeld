import type { Notification, NotificationSummary, WaitingEntry } from '@gameweld/domain';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../api.ts';
import { t, tj } from '../i18n/index.ts';
import { subscribeLive } from '../live.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { Avatar } from './Brand.tsx';

/** A fallback for when live updates do not get through: how often the bell looks by itself. */
const POLL_MS = 5 * 60_000;

/**
 * The bell in the top bar. It counts what waits for the viewer's decision (placement requests to
 * decide, items to accept: states, which stay until someone decides) together with what they
 * have not read yet (events), and opens both. Live updates ring it the moment a notification is
 * made, and tell it when something in a project changed, which may be a decision that was
 * waiting. It also looks again on every move between pages, when the window comes back into
 * view, when it is opened, and now and then.
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
    let soon: number | undefined;
    const unsubscribe = subscribeLive(() => {
      window.clearTimeout(soon);
      soon = window.setTimeout(() => void reload(), 300);
    });
    return () => {
      window.clearTimeout(soon);
      unsubscribe();
    };
  }, [reload]);
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
      ? t('Notifications')
      : t('Notifications: {waiting} waiting for you, {unread} unread', {
          waiting: waiting.length,
          unread: summary?.unread ?? 0,
        });

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
            <h3 id="waiting-heading">{t('Waiting for you')}</h3>
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
            <h3 id="notifications-heading">{t('Notifications')}</h3>
            {(summary?.unread ?? 0) > 0 && (
              <button type="button" className="link" onClick={() => void markRead()}>
                {t('Mark all read')}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="muted small">
              {t(
                'Nothing yet. You will hear when a task is given to you, someone comments on your work, or a decision you asked for is made.',
              )}
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

/**
 * A notification's sentence: <1> is who did it, <2> the task or item it is about. A translation
 * puts them where its grammar wants them. The names in the text only mark the places: the
 * elements bring the real ones, so what people typed is never read as part of the sentence.
 */
function sentence(text: string, who: ReactNode, subject: ReactNode): ReactNode {
  return tj(text, undefined, { 1: () => <strong>{who}</strong>, 2: () => subject });
}

function WaitingRow({ entry }: { entry: WaitingEntry }) {
  const project = `/projects/${entry.project.id}`;
  return entry.kind === 'request' ? (
    <Link to={`${project}/board`} data-close-menu className="notification">
      <span className="notification-system waiting" aria-hidden="true" />
      <span className="notification-text">
        {sentence(
          '<1>{who}</1> asks to place <2>{task}</2> on the Workboard',
          entry.requester?.displayName,
          <strong>{entry.task?.title}</strong>,
        )}
      </span>
      <span className="notification-meta">
        {entry.item.title} · {entry.project.name} · {ago(entry.since)}
      </span>
    </Link>
  ) : (
    <Link to={`${project}/breakdown/${entry.item.id}`} data-close-menu className="notification">
      <span className="notification-system waiting" aria-hidden="true" />
      <span className="notification-text">
        {sentence('<2>{item}</2> is ready for review', null, <strong>{entry.item.title}</strong>)}
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
  const task = <strong>{n.task?.title ?? t('a task')}</strong>;
  const item = <strong>{n.item?.title ?? t('an item')}</strong>;
  return (
    <Link to={to} data-close-menu className="notification" onClick={onOpen}>
      {n.actor ? (
        <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} size={22} />
      ) : (
        <span className="notification-system" aria-hidden="true" />
      )}
      <span className="notification-text">
        {n.kind === 'task.assigned' &&
          sentence('<1>{who}</1> assigned <2>{task}</2> to you', who, task)}
        {n.kind === 'task.unassigned' &&
          sentence('<1>{who}</1> took <2>{task}</2> off your hands', who, task)}
        {n.kind === 'comment.added' &&
          sentence('<1>{who}</1> commented on <2>{subject}</2>', who, n.task ? task : item)}
        {n.kind === 'task.blocked' &&
          sentence('<1>{who}</1> flagged <2>{task}</2> as blocked', who, task)}
        {n.kind === 'mention' &&
          sentence('<1>{who}</1> mentioned you on <2>{subject}</2>', who, n.task ? task : item)}
        {n.kind === 'request.created' &&
          sentence('<1>{who}</1> asks to place <2>{task}</2> on the Workboard', who, task)}
        {n.kind === 'request.approved' &&
          sentence('Your request to place <2>{task}</2> was approved', who, task)}
        {n.kind === 'request.rejected' &&
          sentence('Your request to place <2>{task}</2> was rejected', who, task)}
        {n.kind === 'item.ready_for_review' &&
          sentence('<2>{item}</2> is ready for review', who, item)}
        {n.kind === 'item.accepted' && sentence('<1>{who}</1> accepted <2>{item}</2>', who, item)}
        {n.kind === 'item.rejected' &&
          sentence('<1>{who}</1> sent <2>{item}</2> back from review', who, item)}
        {n.detail && (
          <span className="notification-detail">{t('“{detail}”', { detail: n.detail })}</span>
        )}
      </span>
      <span className="notification-meta">
        {n.project.name} · {ago(n.createdAt)}
        {!n.read && <span className="sr-only">{` · ${t('unread')}`}</span>}
      </span>
    </Link>
  );
}

/** "5 min ago", "3 h ago", then the date. */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return t('{n} min ago', { n: minutes });
  if (minutes < 60 * 24) return t('{n} h ago', { n: Math.round(minutes / 60) });
  return new Date(iso).toLocaleDateString();
}
