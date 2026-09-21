import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What a request carries into the changes it makes: the browser tab it came from, for the live
 * events they cause, and the name of the API token it came with, for their history.
 */
export const requestContext = new AsyncLocalStorage<{
  clientId: string | null;
  token: string | null;
}>();

/**
 * The API token the current request came with, for a record of what its member did. Changes the
 * system makes on its own, with no actor, came through no token.
 */
export function viaToken(actorId: string | null): string | null {
  return actorId === null ? null : (requestContext.getStore()?.token ?? null);
}
