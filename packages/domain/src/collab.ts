import type { ItemState, MoscowCategory } from './backlog.ts';

/** Collaboration and history, specification Sections 5 and 14. */

/**
 * Passive raster formats: the only attachments served inline, and the only ones that become an
 * item's cover. SVG stays a download because it can carry script.
 */
export const PREVIEW_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; displayName: string };
  createdAt: string;
  /** True for PREVIEW_IMAGE_TYPES: shown inline, and eligible as an item cover. */
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
  /** The name of the API token the change came through, or null when it was made in the app. */
  via: string | null;
  /** The fields the change touched, as they were before and after it; null when not recorded. */
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityQuery {
  entityType?: 'backlog_item' | 'task' | 'workboard';
  entityId?: string;
  limit?: number;
}
