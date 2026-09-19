import type { ItemState, MoscowCategory } from './backlog.ts';
import type { Attachment, Comment } from './collab.ts';

/** Task vocabulary from specification Sections 5, 7, and 11. */

export const TASK_CATEGORIES = ['code', 'assets', 'content'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  code: 'Code',
  assets: 'Assets',
  content: 'Content',
};

/** The palette a label's colour comes from; the interface knows how each looks in both themes. */
export const LABEL_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'gray',
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** A project's label. It means what the team says it means; no rule hangs on it. */
export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface LabelInput {
  name: string;
  color: LabelColor;
}

/** Where a task currently is (Section 7: unplaced, on a Workboard, or complete). */
export interface TaskPlacement {
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  /** True when the column is the board's system-marked Done column. */
  inDone: boolean;
  enteredAsException: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  itemId: string;
  category: TaskCategory;
  title: string;
  description: string;
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
  completed: boolean;
  completedAt: string | null;
  archived: boolean;
  /** Attachment id of the cover image shown on the task's Workboard card, if any. */
  coverAttachmentId: string | null;
  /** How far the task's checklist is; cards show it when the task has one. */
  checklist: { total: number; done: number };
  labels: Label[];
  /** An optional date, as YYYY-MM-DD. The product infers nothing from it; cards show it. */
  dueDate: string | null;
  /** Someone flagged that the task cannot go on. It stops nothing; it is there to be seen. */
  blocked: boolean;
  blockedReason: string;
  placement: TaskPlacement | null;
  /** A pending out-of-scope placement request for this task, if any (Section 9). */
  pendingRequest: { id: string; boardId: string; boardName: string; requesterId: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** One step of a task's checklist. Ticking it decides nothing about the task's completion. */
export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface UpdateChecklistItemInput {
  title?: string;
  done?: boolean;
}

export interface TaskDetail extends Task {
  item: { id: string; title: string; category: MoscowCategory; state: ItemState };
  checklistItems: ChecklistItem[];
  comments: Comment[];
  attachments: Attachment[];
  links: { id: string; url: string; label: string }[];
}

/** A card on "My tasks": an unfinished task assigned to the viewer, with its parent item. */
export interface MyTask extends Task {
  itemTitle: string;
  itemCategory: MoscowCategory;
}

/** Where the viewer puts a task in their own order; neither neighbour means the end. */
export interface MoveMyTaskInput {
  afterId?: string | null;
  beforeId?: string | null;
}

export interface CreateTaskInput {
  category: TaskCategory;
  title: string;
  description?: string;
  assigneeId?: string | null;
}

/**
 * Partial update with optimistic concurrency. `itemId` (reparenting) and `archived` require
 * Director permission (D3); `category` can only change while the task is unplaced.
 */
export interface UpdateTaskInput {
  version: number;
  title?: string;
  description?: string;
  category?: TaskCategory;
  assigneeId?: string | null;
  itemId?: string;
  archived?: boolean;
  /** An image attachment of this task, or null to clear the cover. */
  coverAttachmentId?: string | null;
  /** The task's labels, all of them: the ones left out are taken off. */
  labelIds?: string[];
  dueDate?: string | null;
  blocked?: boolean;
  /** Why it is blocked; kept only while it is. */
  blockedReason?: string;
}
