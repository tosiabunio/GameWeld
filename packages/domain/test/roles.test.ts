import { describe, expect, it } from 'vitest';
import { can, PROJECT_ROLES, type Membership, type ProjectAction } from '../src/index.ts';

const open = { doneRestricted: false };
const restricted = { doneRestricted: true };
const only = (role: (typeof PROJECT_ROLES)[number]): Membership => ({
  roles: [role],
  canAccept: false,
});

describe('permission matrix (specification Section 4)', () => {
  it('denies everything to non-members', () => {
    const actions: ProjectAction[] = [
      'project.view',
      'backlog.manage',
      'board.select_scope',
      'task.work',
      'task.complete',
      'item.accept',
      'out_of_scope.approve',
    ];
    for (const action of actions) expect(can(null, action, open)).toBe(false);
  });

  it('lets every member view the project and work on tasks', () => {
    for (const role of PROJECT_ROLES) {
      expect(can(only(role), 'project.view', open)).toBe(true);
      expect(can(only(role), 'task.work', open)).toBe(true);
    }
  });

  it('reserves backlog, scope, and out-of-scope approval to Directors', () => {
    expect(can(only('director'), 'backlog.manage', open)).toBe(true);
    expect(can(only('developer'), 'backlog.manage', open)).toBe(false);
    expect(can(only('tester'), 'board.select_scope', open)).toBe(false);
    expect(can(only('director'), 'out_of_scope.approve', open)).toBe(true);
    expect(can(only('developer'), 'out_of_scope.approve', open)).toBe(false);
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
});
