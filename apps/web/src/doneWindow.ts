import type { BacklogItem } from '@gameweld/domain';

/**
 * The Backlog's Done lane only grows, and it is there to inform. It shows what was accepted
 * lately and keeps the rest behind "Show older", grouped by the month of acceptance. Hidden
 * items stay Done, on the Overview's map, and in its figures: this is the view, not the data.
 */

/** Done shows at least this many of its newest items, so a quiet month does not leave it empty. */
export const RECENT_AT_LEAST = 10;

/** The days of acceptance Done shows at first; 0 shows a page of the newest, whenever accepted. */
export const DONE_WINDOWS = [30, 90, 0] as const;
export type DoneWindow = (typeof DONE_WINDOWS)[number];

/** When an item was accepted; one without an acceptance goes by its last change. */
const acceptedTime = (item: BacklogItem) => item.acceptedAt ?? item.updatedAt;

/** Done, newest acceptance first. */
export const byAcceptance = (items: readonly BacklogItem[]): BacklogItem[] =>
  [...items].sort((a, b) => acceptedTime(b).localeCompare(acceptedTime(a)));

/**
 * How many of Done's items, newest first, show before "Show older": those accepted within the
 * window, but at least RECENT_AT_LEAST and at most a page.
 */
export function recentCount(
  items: readonly BacklogItem[],
  window: DoneWindow,
  now: Date,
  page: number,
): number {
  if (window === 0) return page;
  const since = now.getTime() - window * 86_400_000;
  const recent = items.filter((item) => Date.parse(acceptedTime(item)) >= since).length;
  return Math.min(page, Math.max(RECENT_AT_LEAST, recent));
}

/** The month an item was accepted in, as a heading in the viewer's language: "September 2026". */
export function acceptedMonth(item: BacklogItem, locale: string): string {
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(acceptedTime(item)),
  );
  return month.charAt(0).toLocaleUpperCase(locale) + month.slice(1);
}
