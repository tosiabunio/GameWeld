import type { ItemState, MoscowCategory, TaskCounts } from './backlog.ts';
import type { Task, TaskCategory } from './tasks.ts';

/** Workboard vocabulary from specification Section 8. */

export const COLUMN_KINDS = [
  'todo_code',
  'todo_assets',
  'todo_content',
  'intermediate',
  'done',
] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

/** The To Do column that a task of the given category starts in. */
export function todoKindFor(category: TaskCategory): ColumnKind {
  return `todo_${category}`;
}

export interface BoardColumn {
  id: string;
  name: string;
  kind: ColumnKind;
  rank: string;
  version: number;
}

/** A card on the board: the task plus what the board needs to show about its parent. */
export interface BoardCard extends Task {
  itemTitle: string;
  itemCategory: MoscowCategory;
  /** True when the parent item is not in this board's scope (Section 9 badge). */
  outOfScope: boolean;
  rank: string;
}

export interface ScopeItem {
  id: string;
  title: string;
  category: MoscowCategory;
  state: ItemState;
  taskCounts: TaskCounts;
  /** Accepted as Done; shown distinctly and removable in one click (R3). */
  accepted: boolean;
  addedAt: string;
}

export interface BoardSummary {
  id: string;
  projectId: string;
  name: string;
  description: string;
  state: 'active' | 'archived';
  version: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface BoardView extends BoardSummary {
  columns: BoardColumn[];
  /** Cards keyed by column id, in rank order. */
  cards: Record<string, BoardCard[]>;
  scope: ScopeItem[];
  scopeLimit: number;
  counts: {
    scopeItems: number;
    acceptedItems: number;
    outOfScopeTasks: number;
    placedTasks: number;
    unfinishedTasks: number;
    pendingRequests: number;
  };
  /** The item the priority rule would activate next (D7), if any and if room remains. */
  nextEligible: {
    id: string;
    title: string;
    category: MoscowCategory;
    unplacedTasks: number;
  } | null;
}

export interface CreateBoardInput {
  name: string;
  description?: string;
}

export interface UpdateBoardInput {
  version: number;
  name?: string;
  description?: string;
}

export interface ArchiveBoardInput {
  /** D12: unfinished placed tasks must be explicitly returned to Breakdown before archival. */
  returnUnfinished: boolean;
}

export interface CreateColumnInput {
  name: string;
  /** Insert after this intermediate column; omit to append before Done. */
  afterColumnId?: string | null;
}

export interface UpdateColumnInput {
  version: number;
  name?: string;
  afterColumnId?: string | null;
  beforeColumnId?: string | null;
}

export interface RemoveScopeInput {
  /** Section 12 / R5: return unfinished placed tasks to Breakdown, or keep them as exceptions. */
  returnTasks: boolean;
}

export interface MovePlacementInput {
  columnId: string;
  afterId?: string | null;
  beforeId?: string | null;
}

export interface CreateBoardTaskInput {
  /** Required when several items are in scope (Section 8). */
  itemId?: string;
  category: TaskCategory;
  title: string;
  description?: string;
}
