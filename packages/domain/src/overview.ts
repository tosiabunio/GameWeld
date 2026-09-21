import type { ItemState, MoscowCategory } from './backlog.ts';
import type { TaskCategory } from './tasks.ts';

/** The project at a glance: how far its items and tasks are. */

/**
 * Where a set of tasks stands. Every task that is not complete is in exactly one of `inProgress`
 * (on a Workboard past its To Do column), `toDo` (in a To Do column), or `unplaced` (on no board);
 * `blocked`, `overdue`, and `unassigned` count unfinished tasks and overlap with those.
 */
export interface TaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  toDo: number;
  unplaced: number;
  blocked: number;
  /** With a date before today. */
  overdue: number;
  unassigned: number;
}

export interface OverviewItem {
  id: string;
  title: string;
  category: MoscowCategory;
  state: ItemState;
  /** In the active Workboard's scope. */
  onBoard: boolean;
  tasks: TaskProgress;
}

export interface ProjectOverview {
  /** Every item that is not archived, in Backlog order: by category, then by place. */
  items: OverviewItem[];
  /** The same tasks again, by their category. */
  tasksByCategory: Record<TaskCategory, TaskProgress>;
}
