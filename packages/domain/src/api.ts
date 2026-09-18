import type { Permissions, ProjectRole } from './roles.ts';

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

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  permissions: Permissions;
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
}
