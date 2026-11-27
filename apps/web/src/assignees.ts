import { isObserver, type ProjectRole } from '@gameweld/domain';

/**
 * The members a task can be given to. An Observer only reads the project, so the server refuses
 * one as an assignee and the pickers do not offer them.
 */
export const assignable = <M extends { roles: readonly ProjectRole[] }>(
  members: readonly M[],
): M[] => members.filter((m) => !isObserver(m.roles));
