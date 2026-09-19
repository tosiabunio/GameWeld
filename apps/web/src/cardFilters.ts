import type { BacklogItem, BoardCard, BoardView, TaskCategory } from '@gameweld/domain';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * What the viewer wants to see on the Backlog and the Workboard. The two share one set per
 * project, so "Devin's Code work" carries from one to the other. It lasts for the visit: a
 * filter left on by a past visit would hide cards with nothing on screen to say why.
 */
export interface CardFilters {
  /** Part of a card's title, in any letter case. */
  text: string;
  /** A member's id, `UNASSIGNED`, or empty for anyone. */
  assignee: string;
  type: TaskCategory | '';
  /** Workboard only: tasks of one backlog item. */
  itemId: string;
  /** Workboard only: tasks whose item is outside the board's scope. */
  outOfScope: boolean;
  /** Not a filter: whether the search field, kept behind its icon, is out. */
  searchOpen: boolean;
}

export const UNASSIGNED = 'none';
const NONE: CardFilters = {
  text: '',
  assignee: '',
  type: '',
  itemId: '',
  outOfScope: false,
  searchOpen: false,
};

const byProject = new Map<string, CardFilters>();
const listeners = new Set<() => void>();

export function useCardFilters(projectId: string) {
  const filters = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => byProject.get(projectId) ?? NONE,
  );
  const change = useCallback(
    (next: Partial<CardFilters> | null) => {
      if (next === null) byProject.delete(projectId);
      else byProject.set(projectId, { ...(byProject.get(projectId) ?? NONE), ...next });
      for (const listener of listeners) listener();
    },
    [projectId],
  );
  return [filters, change] as const;
}

/** The items a Workboard card can belong to: the scope, then the parents of out-of-scope cards. */
export function boardItemsOf(board: BoardView): { id: string; title: string }[] {
  const items = new Map(board.scope.map((s) => [s.id, s.title]));
  for (const cards of Object.values(board.cards))
    for (const card of cards) if (!items.has(card.itemId)) items.set(card.itemId, card.itemTitle);
  return [...items].map(([id, title]) => ({ id, title }));
}

const titleMatches = (title: string, text: string) =>
  text.trim() === '' || title.toLowerCase().includes(text.trim().toLowerCase());

const isAssignedTo = (assigneeId: string | null, wanted: string) =>
  wanted === '' || (wanted === UNASSIGNED ? assigneeId === null : assigneeId === wanted);

/** The filters that apply to the Backlog; the Workboard's own two are ignored there. */
export const backlogFiltersOn = (f: CardFilters) =>
  f.text.trim() !== '' || f.assignee !== '' || f.type !== '';

export const boardFiltersOn = (f: CardFilters) =>
  backlogFiltersOn(f) || f.itemId !== '' || f.outOfScope;

/**
 * An item has no assignee or kind of its own: it matches when one of its tasks, finished or not,
 * is that person's and of that kind at once.
 */
export function matchesItem(item: BacklogItem, f: CardFilters): boolean {
  if (!titleMatches(item.title, f.text)) return false;
  if (f.assignee === '' && f.type === '') return true;
  return item.taskFacets.some(
    (facet) =>
      isAssignedTo(facet.assigneeId, f.assignee) && (f.type === '' || facet.category === f.type),
  );
}

export function matchesCard(card: BoardCard, f: CardFilters): boolean {
  return (
    titleMatches(card.title, f.text) &&
    isAssignedTo(card.assignee?.id ?? null, f.assignee) &&
    (f.type === '' || card.category === f.type) &&
    (f.itemId === '' || card.itemId === f.itemId) &&
    (!f.outOfScope || card.outOfScope)
  );
}
