/**
 * API tokens: a member's own keys for scripts and assistants. A token acts as the member who
 * made it, under the same permissions, and can only read or can also write.
 */

export const TOKEN_ACCESS = ['read', 'write'] as const;
export type TokenAccess = (typeof TOKEN_ACCESS)[number];

/** How many tokens one member may have at a time. */
export const MAX_TOKENS_PER_USER = 25;

export interface ApiToken {
  id: string;
  /** What it is for, such as "Claude on my laptop". Unique among the member's tokens. */
  name: string;
  access: TokenAccess;
  createdAt: string;
  /** When a request last came with it, to the minute; null if never. */
  lastUsedAt: string | null;
}

export interface CreateTokenInput {
  name: string;
  access: TokenAccess;
}

/** A token just made. `secret` is shown this once; only a hash of it is kept. */
export interface CreatedToken {
  token: ApiToken;
  secret: string;
}
