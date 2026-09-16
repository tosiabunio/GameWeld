import type { AuthProviders, CurrentUser, ProjectSummary } from '@gameweld/domain';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    // Fastify rejects an empty body that claims to be JSON, so only label real bodies.
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body ? String(body.message) : res.statusText;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = {
  providers: () => request<AuthProviders>('/api/auth/providers'),
  me: () => request<CurrentUser | null>('/api/me'),
  mockSignIn: (persona: string) =>
    request<void>('/api/auth/mock/sign-in', { method: 'POST', body: JSON.stringify({ persona }) }),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
  projects: () => request<ProjectSummary[]>('/api/projects'),
};
