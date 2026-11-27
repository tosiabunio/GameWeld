import { z } from 'zod';

/**
 * Shapes of input that several routes take, checked here once so that what reaches the database
 * is something it can hold.
 */

/** True for a day that exists, written YYYY-MM-DD: 2026-02-31 and year 0000 do not. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A day, as the app's date fields send it. */
export const calendarDate = z.string().refine(isCalendarDate, 'Not a date');

/**
 * An e-mail address as someone types it: the space around it and its capitals do not matter, so
 * they go before it is checked, and the address comes out trimmed and in lower case. (Asked to
 * trim, `z.email()` itself would check first and refuse an address for a space after it.)
 */
export const emailAddress = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.email(),
);

/**
 * A link's address: http or https only. Anything else that parses as a URL (javascript:, data:,
 * file:) is not somewhere a link on a card should lead, whichever client shows it.
 */
export const linkUrl = z
  .url()
  .trim()
  .max(2000)
  .refine((url) => /^https?:\/\//i.test(url), 'A link starts with http:// or https://');
