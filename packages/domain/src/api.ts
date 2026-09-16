import type { ProjectRole } from './roles.ts';

/** Shapes returned by the API and consumed by the web client. */

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  provider: string;
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
}

export interface AuthProviders {
  mock: {
    enabled: boolean;
    personas: { key: string; displayName: string; roles: ProjectRole[] }[];
  };
}
