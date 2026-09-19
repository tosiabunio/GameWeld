/**
 * Notifications and the "waiting for you" list. A notification is an event that concerns a
 * member's work; an entry of the waiting list is a state that needs their decision and stays
 * until they make it.
 */

export const NOTIFICATION_KINDS = [
  'task.assigned',
  'task.unassigned',
  'comment.added',
  'mention',
  'request.created',
  'request.approved',
  'request.rejected',
  'item.ready_for_review',
  'item.accepted',
  'item.rejected',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  id: string;
  kind: NotificationKind;
  project: { id: string; name: string };
  /** Who did it; null when the system did, for instance by settling a request. */
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  task: { id: string; title: string } | null;
  item: { id: string; title: string } | null;
  /** A decision's note, or the start of a comment. */
  detail: string;
  createdAt: string;
  read: boolean;
}

/** Something that waits for the viewer's decision: a placement request, or an item to accept. */
export interface WaitingEntry {
  kind: 'request' | 'review';
  project: { id: string; name: string };
  item: { id: string; title: string };
  /** For a request: the task asked for, and who asked. */
  task: { id: string; title: string } | null;
  requester: { id: string; displayName: string } | null;
  since: string;
}

export interface NotificationSummary {
  unread: number;
  waiting: WaitingEntry[];
  /** The newest notifications, read ones included. */
  notifications: Notification[];
}

export interface MarkNotificationsReadInput {
  /** Omit to mark everything read. */
  ids?: string[];
}
