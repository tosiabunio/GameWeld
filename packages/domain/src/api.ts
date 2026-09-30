import type { Permissions, ProjectRole } from './roles.ts';
import type { Label } from './tasks.ts';

/** Shapes returned by the API and consumed by the web client. */

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  provider: string;
  /** The user's own picture, or null to show initials. */
  avatarUrl: string | null;
  /** Whether they may create a project (a persona's is a demo project). */
  mayCreateProjects: boolean;
}

/**
 * The circle a user keeps from a larger picture, as fractions of that picture: its left and top
 * edges, and its diameter as a fraction of the picture's width.
 */
export interface AvatarCrop {
  left: number;
  top: number;
  size: number;
}

/** The signed-in user's picture, for choosing its circle again. */
export interface MyAvatar {
  avatarUrl: string;
  /** The uploaded picture, upright and bounded, that the crop refers to. */
  sourceUrl: string;
  crop: AvatarCrop;
}

export interface UserSummary {
  id: string;
  displayName: string;
  email: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  roles: ProjectRole[];
  canAccept: boolean;
  doneRestricted: boolean;
  scopeLimit: number;
  itemCount: number;
  archived: boolean;
  version: number;
}

export interface ProjectMember {
  userId: string;
  displayName: string;
  email: string | null;
  roles: ProjectRole[];
  canAccept: boolean;
  avatarUrl: string | null;
}

/**
 * An address invited to a project that has not signed in yet. Its first sign-in with that
 * address, through any provider that has verified it, makes it a member with these roles.
 */
export interface ProjectInvitation {
  id: string;
  email: string;
  roles: ProjectRole[];
  canAccept: boolean;
  /** Who sent it, or null if that account is gone. */
  invitedBy: string | null;
  createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  invitations: ProjectInvitation[];
  permissions: Permissions;
  /** The project's labels, by name. */
  labels: Label[];
}

export interface CreateProjectInput {
  name: string;
  /**
   * Admins only: the address of the project's first Game Director, added or invited, instead of
   * the admin, who does not become a member.
   */
  directorEmail?: string;
  description?: string;
  doneRestricted?: boolean;
  scopeLimit?: number;
}

/** Partial update with optimistic concurrency: `version` must match the stored row. */
export interface UpdateProjectInput {
  version: number;
  name?: string;
  description?: string;
  doneRestricted?: boolean;
  scopeLimit?: number;
  archived?: boolean;
}

export interface AddMemberInput {
  email: string;
  roles: ProjectRole[];
  canAccept?: boolean;
}

export interface UpdateMemberInput {
  roles?: ProjectRole[];
  canAccept?: boolean;
}

export interface AuthProviders {
  mock: {
    enabled: boolean;
    personas: { key: string; displayName: string; roles: ProjectRole[] }[];
  };
  /** OpenID Connect providers; each signs in by navigating to `/api/auth/<id>/start`. */
  oidc: { id: string; label: string }[];
  /** On a demonstration instance, how often its data goes back to the sample data, and when next. */
  demoReset: { everyHours: number; nextAt: string } | null;
}

/** Why a sign-in through a provider did not get in, as `?auth_error=` on the sign-in page. */
export type SignInError = 'not_invited' | 'email_unverified' | 'expired' | 'failed' | 'unavailable';

/** What quick open finds in a project for a few typed letters. */
export interface SearchResults {
  items: { id: string; title: string; state: 'open' | 'ready_for_review' | 'done' }[];
  tasks: { id: string; title: string; completed: boolean; itemTitle: string }[];
}

/**
 * What an admin invites someone to be: an admin, a Game Director who may create projects, or an
 * Observer of chosen projects (a teacher following students' work, say).
 */
export const INSTANCE_ROLES = ['admin', 'director', 'observer'] as const;
export type InstanceRole = (typeof INSTANCE_ROLES)[number];

/** An account on the instance, as an admin sees it on the Administration page. */
export interface InstancePerson {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** May start projects, becoming their Game Director (admins may anyway). */
  canCreateProjects: boolean;
  /** The projects they are a member of, with their roles there. */
  memberships: { projectId: string; projectName: string; roles: ProjectRole[] }[];
}

/** An invitation to one project, for someone who has not signed in yet. */
export interface PendingProjectInvitation {
  id: string;
  projectId: string;
  projectName: string;
  email: string;
  roles: ProjectRole[];
}

/** An admin's invitation for someone who has not signed in yet. */
export interface InstanceInvitation {
  id: string;
  email: string;
  isAdmin: boolean;
  canCreateProjects: boolean;
  invitedBy: string | null;
  createdAt: string;
}

export interface InstancePeople {
  people: InstancePerson[];
  /** Admins' invitations to be admin or Game Director. */
  invitations: InstanceInvitation[];
  /** Invitations to projects, waiting for their first sign-in. */
  projectInvitations: PendingProjectInvitation[];
  /** The team projects that are open, to choose an Observer's from. */
  projects: { id: string; name: string }[];
}

export interface InviteToInstanceInput {
  email: string;
  /** `director`: may create projects; `admin`: may do everything; `observer`: reads `projectIds`. */
  as: InstanceRole;
  /** For an Observer: the team projects they may read. */
  projectIds?: string[];
}

/** What an admin's invitation did. */
export interface InviteResult {
  /** Their account, when they have one: what they were given applies at once. */
  person: InstancePerson | null;
  /** Otherwise, as admin or Game Director: the invitation their first sign-in claims. */
  invitation: InstanceInvitation | null;
  /** Otherwise, as Observer: an invitation to each project. */
  projectInvitations: PendingProjectInvitation[];
  /** Projects left alone because they were already a member there, or invited. */
  skipped: string[];
}

export interface UpdateInstancePersonInput {
  isAdmin?: boolean;
  canCreateProjects?: boolean;
}
