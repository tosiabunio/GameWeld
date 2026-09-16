import type {
  AddLinkInput,
  AddMemberInput,
  BacklogItem,
  BacklogItemDetail,
  CreateItemInput,
  CreateTaskInput,
  ItemLink,
  MoveItemInput,
  UpdateItemInput,
  Task,
  TaskDetail,
  UpdateTaskInput,
  AuthProviders,
  CreateProjectInput,
  CurrentUser,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  UpdateMemberInput,
  UpdateProjectInput,
  UserSummary,
} from '@gameweld/domain';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

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
    const obj =
      body && typeof body === 'object' ? (body as { message?: unknown; details?: unknown }) : {};
    throw new ApiError(
      res.status,
      typeof obj.message === 'string' ? obj.message : res.statusText,
      obj.details,
    );
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const api = {
  providers: () => request<AuthProviders>('/api/auth/providers'),
  me: () => request<CurrentUser | null>('/api/me'),
  mockSignIn: (persona: string) =>
    request<void>('/api/auth/mock/sign-in', json('POST', { persona })),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),

  projects: (archived = false) =>
    request<ProjectSummary[]>(`/api/projects${archived ? '?archived=true' : ''}`),
  createProject: (input: CreateProjectInput) =>
    request<ProjectSummary>('/api/projects', json('POST', input)),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<ProjectSummary>(`/api/projects/${id}`, json('PATCH', input)),

  addMember: (projectId: string, input: AddMemberInput) =>
    request<ProjectMember>(`/api/projects/${projectId}/members`, json('POST', input)),
  updateMember: (projectId: string, userId: string, input: UpdateMemberInput) =>
    request<ProjectMember>(`/api/projects/${projectId}/members/${userId}`, json('PATCH', input)),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),

  users: () => request<UserSummary[]>('/api/users'),

  backlog: (projectId: string) => request<BacklogItem[]>(`/api/projects/${projectId}/backlog`),
  createItem: (projectId: string, input: CreateItemInput) =>
    request<BacklogItem>(`/api/projects/${projectId}/backlog`, json('POST', input)),
  item: (projectId: string, itemId: string) =>
    request<BacklogItemDetail>(`/api/projects/${projectId}/backlog/${itemId}`),
  updateItem: (projectId: string, itemId: string, input: UpdateItemInput) =>
    request<BacklogItem>(`/api/projects/${projectId}/backlog/${itemId}`, json('PATCH', input)),
  moveItem: (projectId: string, itemId: string, input: MoveItemInput) =>
    request<BacklogItem>(`/api/projects/${projectId}/backlog/${itemId}/move`, json('POST', input)),
  addLink: (projectId: string, itemId: string, input: AddLinkInput) =>
    request<ItemLink>(`/api/projects/${projectId}/backlog/${itemId}/links`, json('POST', input)),
  removeLink: (projectId: string, itemId: string, linkId: string) =>
    request<void>(`/api/projects/${projectId}/backlog/${itemId}/links/${linkId}`, {
      method: 'DELETE',
    }),

  tasks: (projectId: string, itemId: string) =>
    request<Task[]>(`/api/projects/${projectId}/backlog/${itemId}/tasks`),
  createTask: (projectId: string, itemId: string, input: CreateTaskInput) =>
    request<Task>(`/api/projects/${projectId}/backlog/${itemId}/tasks`, json('POST', input)),
  task: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}`),
  updateTask: (projectId: string, taskId: string, input: UpdateTaskInput) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}`, json('PATCH', input)),
  completeTask: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}/complete`, { method: 'POST' }),
  reopenTask: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}/reopen`, { method: 'POST' }),
};
