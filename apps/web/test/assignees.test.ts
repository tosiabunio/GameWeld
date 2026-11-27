import { describe, expect, it } from 'vitest';
import { assignable } from '../src/assignees.ts';

describe('who a task can be given to', () => {
  it('is every member but the Observers, in the order given', () => {
    const members = [
      { userId: 'a', roles: ['director'] as const },
      { userId: 'b', roles: ['observer'] as const },
      { userId: 'c', roles: ['developer', 'tester'] as const },
    ];
    expect(assignable(members).map((m) => m.userId)).toEqual(['a', 'c']);
    expect(assignable([])).toEqual([]);
  });
});
