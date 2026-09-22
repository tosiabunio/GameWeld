import type { BacklogItem } from '@gameweld/domain';
import { describe, expect, it } from 'vitest';
import { acceptedMonth, byAcceptance, recentCount, RECENT_AT_LEAST } from '../src/doneWindow.ts';
import { shownCards } from '../src/lanePaging.ts';

const ids = (n: number, prefix = 'c') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('shownCards', () => {
  it('shows the first cards up to the limit', () => {
    expect([...shownCards(ids(5), 5, 3, undefined, true)]).toEqual(['c0', 'c1', 'c2']);
    expect(shownCards(ids(2), 2, 3, undefined, true).size).toBe(2);
  });

  it('shows a card that joined the lane wherever it landed', () => {
    const before = { ids: ids(5), total: 5, shown: shownCards(ids(5), 5, 3, undefined, true) };
    const now = [...ids(5), 'new'];
    expect(shownCards(now, 6, 3, before, true).has('new')).toBe(true);
    // Also while a filter is on, when it matches the new card.
    expect(shownCards(now, 6, 3, before, false).has('new')).toBe(true);
  });

  it('keeps a card that showed before and moved past the limit', () => {
    const before = { ids: ids(5), total: 5, shown: shownCards(ids(5), 5, 3, undefined, true) };
    // c2 moved one place down, below c3.
    const now = ['c0', 'c1', 'c3', 'c2', 'c4'];
    expect([...shownCards(now, 5, 3, before, true)].sort()).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('does not take what a filter brings back for new cards', () => {
    // A filter showed two of five; clearing it lists all five again, and the lane holds five.
    const filtered = { ids: ['c3', 'c4'], total: 5, shown: new Set(['c3', 'c4']) };
    expect([...shownCards(ids(5), 5, 2, filtered, false)]).toEqual(['c0', 'c1']);
  });

  it('forgets a card that left the lane', () => {
    const before = { ids: ids(4), total: 4, shown: new Set(ids(4)) };
    expect(shownCards(['c0', 'c2', 'c3'], 3, 2, before, true).has('c1')).toBe(false);
  });
});

const item = (id: string, acceptedAt: string | null, updatedAt = '2026-01-01T00:00:00Z') =>
  ({ id, acceptedAt, updatedAt }) as BacklogItem;

describe('the Done window', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it('orders Done by acceptance, newest first, and falls back on the last change', () => {
    const items = [
      item('old', '2026-03-01T00:00:00Z'),
      item('new', '2026-09-20T00:00:00Z'),
      item('none', null, '2026-06-01T00:00:00Z'),
    ];
    expect(byAcceptance(items).map((i) => i.id)).toEqual(['new', 'none', 'old']);
  });

  it('shows what was accepted within the window', () => {
    const items = byAcceptance([
      ...Array.from({ length: 14 }, (_, i) => item(`r${i}`, daysAgo(i + 1))),
      ...Array.from({ length: 20 }, (_, i) => item(`o${i}`, daysAgo(40 + i))),
    ]);
    expect(recentCount(items, 30, now, 50)).toBe(14);
    expect(recentCount(items, 90, now, 50)).toBe(34);
    // At most a page, and without a window, a page.
    expect(recentCount(items, 90, now, 20)).toBe(20);
    expect(recentCount(items, 0, now, 50)).toBe(50);
  });

  it('shows at least the newest few after a quiet month', () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`o${i}`, daysAgo(60 + i)));
    expect(recentCount(items, 30, now, 50)).toBe(RECENT_AT_LEAST);
  });

  it('names the month of acceptance in the viewer’s language', () => {
    const accepted = item('a', '2026-09-15T12:00:00Z');
    expect(acceptedMonth(accepted, 'en')).toBe('September 2026');
    expect(acceptedMonth(accepted, 'pl')).toBe('Wrzesień 2026');
  });
});
