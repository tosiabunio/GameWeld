/** Backlog vocabulary from specification Section 6. */

export const MOSCOW_CATEGORIES = ['must', 'should', 'could', 'wont'] as const;
export type MoscowCategory = (typeof MOSCOW_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MoscowCategory, string> = {
  must: 'Must Have',
  should: 'Should Have',
  could: 'Could Have',
  wont: "Won't Have",
};

export const ITEM_STATES = ['open', 'ready_for_review', 'done'] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export const STATE_LABELS: Record<ItemState, string> = {
  open: 'Open',
  ready_for_review: 'Ready for Review',
  done: 'Done',
};

/** The six Backlog lanes: four planning categories for open items, then the two lifecycle lanes. */
export type BacklogLane = MoscowCategory | 'ready_for_review' | 'done';
export const BACKLOG_LANES: readonly BacklogLane[] = [
  ...MOSCOW_CATEGORIES,
  'ready_for_review',
  'done',
];
export const LANE_LABELS: Record<BacklogLane, string> = {
  ...CATEGORY_LABELS,
  ...STATE_LABELS,
} as Record<BacklogLane, string>;

export function laneOf(item: { category: MoscowCategory; state: ItemState }): BacklogLane {
  return item.state === 'open' ? item.category : item.state;
}

export interface TaskCounts {
  total: number;
  completed: number;
}

export interface BacklogItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: MoscowCategory;
  rank: string;
  state: ItemState;
  archived: boolean;
  version: number;
  taskCounts: TaskCounts;
  /** The active Workboard whose scope includes this item, if any (the "board badge"). */
  activeBoard: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemLink {
  id: string;
  url: string;
  label: string;
}

export interface BacklogItemDetail extends BacklogItem {
  links: ItemLink[];
}

export interface CreateItemInput {
  title: string;
  description?: string;
  category: MoscowCategory;
}

export interface UpdateItemInput {
  version: number;
  title?: string;
  description?: string;
  archived?: boolean;
}

/**
 * Reorder or recategorize. The item is placed between `afterId` and `beforeId` within the
 * target category's open items; omitting both appends at the end.
 */
export interface MoveItemInput {
  category: MoscowCategory;
  afterId?: string | null;
  beforeId?: string | null;
}

export interface AddLinkInput {
  url: string;
  label?: string;
}
