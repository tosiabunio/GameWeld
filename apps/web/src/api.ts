import type {
  AcceptItemInput,
  AvatarCrop,
  MyAvatar,
  ActivityEntry,
  ActivityQuery,
  Attachment,
  Comment,
  Dependency,
  UpdateCommentInput,
  AddCommentInput,
  AddLinkInput,
  ItemComment,
  RejectItemInput,
  ArchiveBoardInput,
  BoardSummary,
  ChecklistItem,
  UpdateChecklistItemInput,
  BoardView,
  CreateBoardInput,
  CreateBoardTaskInput,
  CreateColumnInput,
  CreateRequestInput,
  DecideRequestInput,
  WorkRequest,
  MovePlacementInput,
  NotificationSummary,
  MarkNotificationsReadInput,
  MoveMyTaskInput,
  MyTask,
  RemoveScopeInput,
  UpdateBoardInput,
  UpdateColumnInput,
  AddMemberInput,
  BacklogItem,
  BacklogItemDetail,
  CreateItemInput,
  CreateTaskInput,
  ItemLink,
  Label,
  LabelInput,
  MoveItemInput,
  UpdateItemInput,
  Task,
  TaskCategory,
  TaskDetail,
  UpdateTaskInput,
  AuthProviders,
  CreateProjectInput,
  CurrentUser,
  ProjectDetail,
  ProjectInvitation,
  ProjectMember,
  ProjectSummary,
  SearchResults,
  UpdateMemberInput,
  UpdateProjectInput,
  UserSummary,
} from '@gameweld/domain';

import { clientId } from './live.ts';

export type TrelloImportMode = 'cards_as_tasks' | 'cards_as_items';
export interface TrelloImportResult {
  items: number;
  tasks: number;
  labels: number;
  checklistItems: number;
  comments: number;
  links: number;
}

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
      // Names this tab, so the live event a change causes can be told from other people's.
      'x-client-id': clientId,
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
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
  myAvatar: () => request<MyAvatar | null>('/api/me/avatar'),
  /** A new picture and the circle to keep from it. */
  uploadAvatar: (file: File, crop: AvatarCrop) => {
    const form = new FormData();
    form.append('file', file, file.name);
    const circle = new URLSearchParams({
      left: String(crop.left),
      top: String(crop.top),
      size: String(crop.size),
    });
    return request<MyAvatar>(`/api/me/avatar?${circle}`, { method: 'POST', body: form });
  },
  cropAvatar: (crop: AvatarCrop) => request<MyAvatar>('/api/me/avatar', json('PATCH', crop)),
  deleteAvatar: () => request<void>('/api/me/avatar', { method: 'DELETE' }),
  mockSignIn: (persona: string) =>
    request<void>('/api/auth/mock/sign-in', json('POST', { persona })),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),

  search: (projectId: string, q: string) =>
    request<SearchResults>(`/api/projects/${projectId}/search?q=${encodeURIComponent(q)}`),
  notifications: () => request<NotificationSummary>('/api/notifications'),
  markNotificationsRead: (input: MarkNotificationsReadInput = {}) =>
    request<void>('/api/notifications/read', json('POST', input)),

  projects: (archived = false) =>
    request<ProjectSummary[]>(`/api/projects${archived ? '?archived=true' : ''}`),
  createProject: (input: CreateProjectInput) =>
    request<ProjectSummary>('/api/projects', json('POST', input)),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<ProjectSummary>(`/api/projects/${id}`, json('PATCH', input)),

  addMember: (projectId: string, input: AddMemberInput) =>
    request<ProjectMember | ProjectInvitation>(
      `/api/projects/${projectId}/members`,
      json('POST', input),
    ),
  updateMember: (projectId: string, userId: string, input: UpdateMemberInput) =>
    request<ProjectMember>(`/api/projects/${projectId}/members/${userId}`, json('PATCH', input)),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
  cancelInvitation: (projectId: string, invitationId: string) =>
    request<void>(`/api/projects/${projectId}/invitations/${invitationId}`, { method: 'DELETE' }),

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

  acceptItem: (projectId: string, itemId: string, input: AcceptItemInput) =>
    request<{ ok: true }>(
      `/api/projects/${projectId}/backlog/${itemId}/accept`,
      json('POST', input),
    ),
  rejectItem: (projectId: string, itemId: string, input: RejectItemInput) =>
    request<ItemComment>(
      `/api/projects/${projectId}/backlog/${itemId}/reject`,
      json('POST', input),
    ),
  addItemComment: (projectId: string, itemId: string, input: AddCommentInput) =>
    request<ItemComment>(
      `/api/projects/${projectId}/backlog/${itemId}/comments`,
      json('POST', input),
    ),

  tasks: (projectId: string, itemId: string) =>
    request<Task[]>(`/api/projects/${projectId}/backlog/${itemId}/tasks`),
  createTask: (projectId: string, itemId: string, input: CreateTaskInput) =>
    request<Task>(`/api/projects/${projectId}/backlog/${itemId}/tasks`, json('POST', input)),
  task: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}`),
  updateTask: (projectId: string, taskId: string, input: UpdateTaskInput) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}`, json('PATCH', input)),
  /** A download: the whole project as JSON, or its tasks as CSV. */
  exportUrl: (projectId: string, format: 'json' | 'csv') =>
    `/api/projects/${projectId}/${format === 'json' ? 'export.json' : 'export/tasks.csv'}`,
  importTrello: (
    projectId: string,
    input: { mode: TrelloImportMode; category: TaskCategory; board: unknown },
  ) => request<TrelloImportResult>(`/api/projects/${projectId}/import/trello`, json('POST', input)),
  createLabel: (projectId: string, input: LabelInput) =>
    request<Label[]>(`/api/projects/${projectId}/labels`, json('POST', input)),
  updateLabel: (projectId: string, labelId: string, input: LabelInput) =>
    request<Label[]>(`/api/projects/${projectId}/labels/${labelId}`, json('PATCH', input)),
  deleteLabel: (projectId: string, labelId: string) =>
    request<Label[]>(`/api/projects/${projectId}/labels/${labelId}`, { method: 'DELETE' }),
  addChecklistItem: (projectId: string, taskId: string, title: string) =>
    request<ChecklistItem[]>(
      `/api/projects/${projectId}/tasks/${taskId}/checklist`,
      json('POST', { title }),
    ),
  updateChecklistItem: (
    projectId: string,
    taskId: string,
    checkId: string,
    input: UpdateChecklistItemInput,
  ) =>
    request<ChecklistItem[]>(
      `/api/projects/${projectId}/tasks/${taskId}/checklist/${checkId}`,
      json('PATCH', input),
    ),
  removeChecklistItem: (projectId: string, taskId: string, checkId: string) =>
    request<ChecklistItem[]>(`/api/projects/${projectId}/tasks/${taskId}/checklist/${checkId}`, {
      method: 'DELETE',
    }),
  completeTask: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}/complete`, { method: 'POST' }),
  reopenTask: (projectId: string, taskId: string) =>
    request<TaskDetail>(`/api/projects/${projectId}/tasks/${taskId}/reopen`, { method: 'POST' }),

  /** The viewer's unfinished tasks in this project, in the viewer's own order. */
  myTasks: (projectId: string) => request<MyTask[]>(`/api/projects/${projectId}/my-tasks`),
  moveMyTask: (projectId: string, taskId: string, input: MoveMyTaskInput) =>
    request<MyTask[]>(`/api/projects/${projectId}/my-tasks/${taskId}/move`, json('POST', input)),

  activeBoard: (projectId: string) => request<BoardView | null>(`/api/projects/${projectId}/board`),
  boards: (projectId: string) => request<BoardSummary[]>(`/api/projects/${projectId}/boards`),
  board: (projectId: string, boardId: string) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}`),
  createBoard: (projectId: string, input: CreateBoardInput) =>
    request<BoardView>(`/api/projects/${projectId}/boards`, json('POST', input)),
  updateBoard: (projectId: string, boardId: string, input: UpdateBoardInput) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}`, json('PATCH', input)),
  archiveBoard: (projectId: string, boardId: string, input: ArchiveBoardInput) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}/archive`, json('POST', input)),
  createColumn: (projectId: string, boardId: string, input: CreateColumnInput) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}/columns`, json('POST', input)),
  updateColumn: (projectId: string, boardId: string, columnId: string, input: UpdateColumnInput) =>
    request<BoardView>(
      `/api/projects/${projectId}/boards/${boardId}/columns/${columnId}`,
      json('PATCH', input),
    ),
  deleteColumn: (projectId: string, boardId: string, columnId: string) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}/columns/${columnId}`, {
      method: 'DELETE',
    }),
  addToScope: (projectId: string, boardId: string, itemId: string) =>
    request<BoardView>(
      `/api/projects/${projectId}/boards/${boardId}/scope`,
      json('POST', { itemId }),
    ),
  removeFromScope: (projectId: string, boardId: string, itemId: string, input: RemoveScopeInput) =>
    request<BoardView>(
      `/api/projects/${projectId}/boards/${boardId}/scope/${itemId}/remove`,
      json('POST', input),
    ),
  placeTask: (projectId: string, boardId: string, taskId: string) =>
    request<BoardView>(
      `/api/projects/${projectId}/boards/${boardId}/placements`,
      json('POST', { taskId }),
    ),
  createBoardTask: (projectId: string, boardId: string, input: CreateBoardTaskInput) =>
    request<BoardView>(`/api/projects/${projectId}/boards/${boardId}/tasks`, json('POST', input)),
  movePlacement: (projectId: string, boardId: string, taskId: string, input: MovePlacementInput) =>
    request<BoardView>(
      `/api/projects/${projectId}/boards/${boardId}/placements/${taskId}/move`,
      json('POST', input),
    ),
  // Collaboration and history (Phase 7)
  attachmentUrl: (projectId: string, attachmentId: string, inline = false) =>
    `/api/projects/${projectId}/attachments/${attachmentId}${inline ? '?inline=1' : ''}`,
  /** The card-sized 16:9 rendition of an image attachment. */
  coverUrl: (projectId: string, attachmentId: string) =>
    `/api/projects/${projectId}/attachments/${attachmentId}/cover`,
  uploadAttachment: async (
    projectId: string,
    owner: { itemId: string } | { taskId: string },
    file: File,
  ): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file, file.name);
    const path = 'itemId' in owner ? `backlog/${owner.itemId}` : `tasks/${owner.taskId}`;
    return request<Attachment>(`/api/projects/${projectId}/${path}/attachments`, {
      method: 'POST',
      body: form,
    });
  },
  deleteAttachment: (projectId: string, attachmentId: string) =>
    request<void>(`/api/projects/${projectId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  addComment: (projectId: string, owner: { itemId: string } | { taskId: string }, body: string) =>
    request<Comment>(
      `/api/projects/${projectId}/${'itemId' in owner ? `backlog/${owner.itemId}` : `tasks/${owner.taskId}`}/comments`,
      json('POST', { body }),
    ),
  updateComment: (projectId: string, commentId: string, input: UpdateCommentInput) =>
    request<Comment>(`/api/projects/${projectId}/comments/${commentId}`, json('PATCH', input)),
  deleteComment: (projectId: string, commentId: string) =>
    request<void>(`/api/projects/${projectId}/comments/${commentId}`, { method: 'DELETE' }),
  addTaskLink: (projectId: string, taskId: string, input: AddLinkInput) =>
    request<ItemLink>(`/api/projects/${projectId}/tasks/${taskId}/links`, json('POST', input)),
  removeTaskLink: (projectId: string, taskId: string, linkId: string) =>
    request<void>(`/api/projects/${projectId}/tasks/${taskId}/links/${linkId}`, {
      method: 'DELETE',
    }),
  addDependency: (projectId: string, itemId: string, dependsOnItemId: string) =>
    request<{ dependsOn: Dependency[]; dependents: Dependency[] }>(
      `/api/projects/${projectId}/backlog/${itemId}/dependencies`,
      json('POST', { dependsOnItemId }),
    ),
  removeDependency: (projectId: string, itemId: string, dependsOnItemId: string) =>
    request<{ dependsOn: Dependency[]; dependents: Dependency[] }>(
      `/api/projects/${projectId}/backlog/${itemId}/dependencies/${dependsOnItemId}`,
      { method: 'DELETE' },
    ),
  activity: (projectId: string, query: ActivityQuery = {}) => {
    const params = new URLSearchParams();
    if (query.entityType && query.entityId) {
      params.set('entityType', query.entityType);
      params.set('entityId', query.entityId);
    }
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return request<ActivityEntry[]>(`/api/projects/${projectId}/activity${qs ? `?${qs}` : ''}`);
  },

  requests: (projectId: string, boardId: string) =>
    request<WorkRequest[]>(`/api/projects/${projectId}/boards/${boardId}/requests`),
  createRequest: (projectId: string, boardId: string, input: CreateRequestInput) =>
    request<WorkRequest>(
      `/api/projects/${projectId}/boards/${boardId}/requests`,
      json('POST', input),
    ),
  withdrawRequest: (projectId: string, boardId: string, requestId: string) =>
    request<WorkRequest>(
      `/api/projects/${projectId}/boards/${boardId}/requests/${requestId}/withdraw`,
      { method: 'POST' },
    ),
  decideRequest: (
    projectId: string,
    boardId: string,
    requestId: string,
    verb: 'approve' | 'reject',
    input: DecideRequestInput,
  ) =>
    request<WorkRequest>(
      `/api/projects/${projectId}/boards/${boardId}/requests/${requestId}/${verb}`,
      json('POST', input),
    ),
};
