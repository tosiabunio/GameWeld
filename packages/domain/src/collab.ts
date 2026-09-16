import type { ItemState, MoscowCategory } from './backlog.ts';

/** Collaboration and history, specification Sections 5 and 14. */

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; displayName: string };
  createdAt: string;
  /** True for image types the browser can show inline (used for item covers). */
  isImage: boolean;
}

export interface Comment {
  id: string;
  author: { id: string; displayName: string };
  body: string;
  kind: 'comment' | 'rejection';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCommentInput {
  body: string;
}

/** D9: an informational link between backlog items; never blocks work. */
export interface Dependency {
  id: string;
  title: string;
  category: MoscowCategory;
  state: ItemState;
}

export interface ActivityEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  actor: { id: string; displayName: string } | null;
  previous: unknown;
  next: unknown;
  createdAt: string;
}

export interface ActivityQuery {
  entityType?: 'backlog_item' | 'task' | 'workboard';
  entityId?: string;
  limit?: number;
}
