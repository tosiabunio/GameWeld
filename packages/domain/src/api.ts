import type { Permissions, ProjectRole } from './roles.ts';

/** Shapes returned by the API and consumed by the web client. */

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  provider: string;
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
