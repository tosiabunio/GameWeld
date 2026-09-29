/**
 * Project roles from specification Section 4. A member may hold several, except an Observer, who
 * holds only that role: they read the Backlog, the Workboard, and the Overview, and change nothing.
 */
export const PROJECT_ROLES = ['director', 'developer', 'tester', 'observer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ROLE_LABELS: Record<ProjectRole, string> = {
  director: 'Game Director',
  developer: 'Developer',
  tester: 'Tester',
  observer: 'Observer',
};

/** An Observer's roles are that one alone; any other set of roles leaves it out. */
export function validRoles(roles: readonly ProjectRole[]): boolean {
  return roles.length > 0 && (!roles.includes('observer') || roles.length === 1);
}

export const isObserver = (roles: readonly ProjectRole[]): boolean => roles.includes('observer');

/** Roles after ticking or unticking one: Observer replaces the others, and they replace it. */
export function toggleRole(
  roles: readonly ProjectRole[],
  role: ProjectRole,
  on: boolean,
): ProjectRole[] {
  if (!on) return roles.filter((r) => r !== role);
  if (role === 'observer') return ['observer'];
  return [...roles.filter((r) => r !== 'observer' && r !== role), role];
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && (PROJECT_ROLES as readonly string[]).includes(value);
}

/** Actions from the permission table in specification Section 4, plus project administration. */
export const PROJECT_ACTIONS = [
  'project.view',
  'project.history',
  'project.settings',
  'members.manage',
  'backlog.manage',
  'board.manage',
  'board.select_scope',
  'task.work',
  'task.complete',
  'item.accept',
  'out_of_scope.approve',
] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

export function isProjectAction(value: unknown): value is ProjectAction {
  return typeof value === 'string' && (PROJECT_ACTIONS as readonly string[]).includes(value);
}

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
  if (!membership || membership.roles.length === 0) return false;
  // An Observer reads the project and nothing more: no history, no work, no decisions.
  if (isObserver(membership.roles)) return action === 'project.view';
  const has = (role: ProjectRole) => membership.roles.includes(role);
  switch (action) {
    case 'project.view':
    case 'project.history':
    case 'task.work':
      return true;
    case 'project.settings':
    case 'members.manage':
    case 'backlog.manage':
    case 'board.manage':
    case 'board.select_scope':
    case 'out_of_scope.approve':
      return has('director');
    case 'task.complete':
      return policy.doneRestricted ? has('tester') : true;
    case 'item.accept':
      return has('director') || membership.canAccept;
  }
}

export type Permissions = Record<ProjectAction, boolean>;

/** Every action evaluated at once, for the client to hide unavailable controls. */
export function permissionsFor(membership: Membership | null, policy: ProjectPolicy): Permissions {
  return Object.fromEntries(
    PROJECT_ACTIONS.map((action) => [action, can(membership, action, policy)]),
  ) as Permissions;
}
