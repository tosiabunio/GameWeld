/**
 * Paging in a lane of cards. A lane shows its first cards and keeps the rest behind a button, so
 * a Backlog of hundreds of items does not render hundreds of cards (and their covers) at once.
 * Plain logic, apart from the component, so that it can be tested on its own.
 */

/** How many cards a lane shows at first, and how many more each "Show more" brings. */
export const LANE_PAGE = 50;

/** What a lane showed when it was last drawn. */
export interface ShownBefore {
  ids: readonly string[];
  /** How many cards the lane held, counting those a filter hides. */
  total: number;
  shown: ReadonlySet<string>;
}

/**
 * Which of a lane's cards show: the first `limit`, and two kinds past them. A card that joined
 * the lane (added, moved in, or brought by someone else's change) shows wherever it landed, and,
 * unless `keep` is off, a card that showed before shows while it stays in the lane. A card must
 * not vanish behind "Show more" because it was moved one place down or added at the end.
 *
 * A card has joined when the lane holds more cards than before and this one was not among them;
 * a filter changes which cards are listed but not how many the lane holds, so what a filter
 * brings back is not new. While a filter is on, `keep` is off: cards cannot be reordered then,
 * and what the last keystroke matched must not stay scattered past the limit.
 */
export function shownCards(
  ids: readonly string[],
  total: number,
  limit: number,
  before: ShownBefore | undefined,
  keep: boolean,
): Set<string> {
  const shown = new Set(ids.slice(0, limit));
  if (!before) return shown;
  const had = new Set(before.ids);
  const grew = total > before.total;
  for (const id of ids) if ((keep && before.shown.has(id)) || (grew && !had.has(id))) shown.add(id);
  return shown;
}
