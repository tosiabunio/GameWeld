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
}

/** Why a sign-in through a provider did not get in, as `?auth_error=` on the sign-in page. */
export type SignInError = 'not_invited' | 'email_unverified' | 'expired' | 'failed' | 'unavailable';

/** What quick open finds in a project for a few typed letters. */
export interface SearchResults {
  items: { id: string; title: string; state: 'open' | 'ready_for_review' | 'done' }[];
  tasks: { id: string; title: string; completed: boolean; itemTitle: string }[];
}
