import { describe, expect, it } from 'vitest';
import {
  can,
  permissionsFor,
  PROJECT_ACTIONS,
  PROJECT_ROLES,
  toggleRole,
  validRoles,
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

  it('lets every member view the project, and all but Observers read its history and work', () => {
    for (const role of PROJECT_ROLES) {
      expect(can(only(role), 'project.view', open)).toBe(true);
      expect(can(only(role), 'project.history', open)).toBe(role !== 'observer');
      expect(can(only(role), 'task.work', open)).toBe(role !== 'observer');
    }
  });

  it('lets an Observer only view, even when allowed to accept', () => {
    const observer = { roles: ['observer' as const], canAccept: true };
    const allowed = PROJECT_ACTIONS.filter((a) => can(observer, a, open));
    expect(allowed).toEqual(['project.view']);
  });

  it('keeps the Observer role alone', () => {
    expect(validRoles(['observer'])).toBe(true);
    expect(validRoles(['observer', 'tester'])).toBe(false);
    expect(validRoles(['director', 'tester'])).toBe(true);
    expect(validRoles([])).toBe(false);
    expect(toggleRole(['director', 'tester'], 'observer', true)).toEqual(['observer']);
    expect(toggleRole(['observer'], 'developer', true)).toEqual(['developer']);
    expect(toggleRole(['director'], 'tester', true)).toEqual(['director', 'tester']);
    expect(toggleRole(['director', 'tester'], 'tester', false)).toEqual(['director']);
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
