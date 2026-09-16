import type { ItemState, MoscowCategory } from './backlog.ts';

/** Task vocabulary from specification Sections 5, 7, and 11. */

export const TASK_CATEGORIES = ['code', 'assets', 'content'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  code: 'Code',
  assets: 'Assets',
  content: 'Content',
};

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
  assignee: { id: string; displayName: string } | null;
  completed: boolean;
  completedAt: string | null;
  archived: boolean;
  placement: TaskPlacement | null;
  /** A pending out-of-scope placement request for this task, if any (Section 9). */
  pendingRequest: { id: string; boardId: string; boardName: string; requesterId: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  item: { id: string; title: string; category: MoscowCategory; state: ItemState };
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
}
