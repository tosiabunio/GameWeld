import { PERSONAS, type CurrentUser } from '@gameweld/domain';
import type { Config } from './config.ts';

/**
 * The demo beside the teams (docs/deployment.md). Anyone may sign in as a persona, so personas
 * work only in demo projects, which take no one else, and a demo reset replaces only those.
 */
export const isPersona = (user: Pick<CurrentUser, 'provider'>): boolean => user.provider === 'mock';

/** A persona's address; `email` lower-cased. */
export const isPersonaEmail = (email: string): boolean =>
  PERSONAS.some((p) => p.email.toLowerCase() === email);

/** SQL: the user with id `userId` is a persona. */
export const personaSql = (userId: string): string =>
  `EXISTS (SELECT 1 FROM identities pi WHERE pi.user_id = ${userId} AND pi.provider = 'mock')`;

/** A persona makes demo projects; anyone else a team project, when PROJECT_CREATORS lets them. */
export function mayCreateProjects(
  config: Pick<Config, 'projectCreators'>,
  user: Pick<CurrentUser, 'provider' | 'isAdmin'>,
): boolean {
  return isPersona(user) || config.projectCreators === 'everyone' || user.isAdmin;
}
