import { describe, expect, it } from 'vitest';
import {
  can,
  permissionsFor,
  PROJECT_ACTIONS,
  PROJECT_ROLES,
  type Membership,
} from '../src/index.ts';

const open = { doneRestricted: false };
const restricted = { doneRestricted: true };
const only = (role: (typeof PROJECT_ROLES)[number]): Membership => ({
  roles: [role],
  canAccept: false,
});

describe('permission matrix (specification Section 4)', () => {
  it('denies everything to non-members and to empty memberships', () => {
    for (const action of PROJECT_ACTIONS) {
      expect(can(null, action, open)).toBe(false);
      expect(can({ roles: [], canAccept: true }, action, open)).toBe(false);
    }
  });

  it('lets every member view the project and work on tasks', () => {
    for (const role of PROJECT_ROLES) {
      expect(can(only(role), 'project.view', open)).toBe(true);
      expect(can(only(role), 'task.work', open)).toBe(true);
    }
  });

  it('reserves settings, membership, backlog, scope, and out-of-scope approval to Directors', () => {
    for (const action of [
      'project.settings',
      'members.manage',
      'backlog.manage',
      'board.manage',
      'board.select_scope',
      'out_of_scope.approve',
    ] as const) {
      expect(can(only('director'), action, open)).toBe(true);
      expect(can(only('developer'), action, open)).toBe(false);
      expect(can(only('tester'), action, open)).toBe(false);
    }
  });

  it('applies the Done restriction to everyone, including Directors', () => {
    expect(can(only('developer'), 'task.complete', open)).toBe(true);
    expect(can(only('developer'), 'task.complete', restricted)).toBe(false);
    expect(can(only('director'), 'task.complete', restricted)).toBe(false);
    expect(can(only('tester'), 'task.complete', restricted)).toBe(true);
    expect(
      can({ roles: ['director', 'tester'], canAccept: false }, 'task.complete', restricted),
    ).toBe(true);
  });

  it('lets Directors accept by default and others only with explicit permission', () => {
    expect(can(only('director'), 'item.accept', open)).toBe(true);
    expect(can(only('tester'), 'item.accept', open)).toBe(false);
    expect(can({ roles: ['tester'], canAccept: true }, 'item.accept', open)).toBe(true);
  });

  it('evaluates every action at once', () => {
    const p = permissionsFor(only('developer'), restricted);
    expect(Object.keys(p).sort()).toEqual([...PROJECT_ACTIONS].sort());
    expect(p['task.work']).toBe(true);
    expect(p['task.complete']).toBe(false);
    expect(p['project.settings']).toBe(false);
  });
});
