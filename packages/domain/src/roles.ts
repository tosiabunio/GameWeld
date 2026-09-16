/** Project roles from specification Section 4. A member may hold several. */
export const PROJECT_ROLES = ['director', 'developer', 'tester'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ROLE_LABELS: Record<ProjectRole, string> = {
  director: 'Game Director',
  developer: 'Developer',
  tester: 'Tester',
};

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && (PROJECT_ROLES as readonly string[]).includes(value);
}

/** Actions from the permission table in specification Section 4. */
export type ProjectAction =
  | 'project.view'
  | 'backlog.manage'
  | 'board.select_scope'
  | 'task.work'
  | 'task.complete'
  | 'item.accept'
  | 'out_of_scope.approve';

export interface Membership {
  roles: readonly ProjectRole[];
  /** Explicit acceptance permission (D5); Directors accept by default. */
  canAccept: boolean;
}

export interface ProjectPolicy {
  /** When true, only members with the Tester role may move tasks into or out of Done (R2). */
  doneRestricted: boolean;
}

/**
 * Permission matrix, Section 4. This is the single source of truth (R7): the API enforces it and
 * the client uses it only to hide unavailable actions.
 */
export function can(
  membership: Membership | null,
  action: ProjectAction,
  policy: ProjectPolicy,
): boolean {
  if (!membership) return false;
  const has = (role: ProjectRole) => membership.roles.includes(role);
  switch (action) {
    case 'project.view':
    case 'task.work':
      return membership.roles.length > 0;
    case 'backlog.manage':
    case 'board.select_scope':
    case 'out_of_scope.approve':
      return has('director');
    case 'task.complete':
      return policy.doneRestricted ? has('tester') : membership.roles.length > 0;
    case 'item.accept':
      return has('director') || membership.canAccept;
  }
}
