import { describe, expect, it } from 'vitest';
import { isWholeDate } from '../src/components/DateInput.tsx';

describe('a date that is whole enough to save', () => {
  it('has a year typed to its fourth digit', () => {
    // What a browser's date field reports while "2026" is typed into the year.
    for (const stage of ['0002-11-05', '0020-11-05', '0202-11-05'])
      expect(isWholeDate(stage), stage).toBe(false);
    expect(isWholeDate('2026-11-05')).toBe(true);
  });

  it('is not an empty field, which is saved as no date only when the field is left', () => {
    expect(isWholeDate('')).toBe(false);
  });
});
