import type * as d from '@gameweld/domain';
import {
  COLUMN_KINDS,
  ITEM_STATES,
  LABEL_COLORS,
  MOSCOW_CATEGORIES,
  NOTIFICATION_KINDS,
  PROJECT_ACTIONS,
  PROJECT_ROLES,
  REQUEST_STATUSES,
  TASK_CATEGORIES,
  TOKEN_ACCESS,
  type ProjectAction,
} from '@gameweld/domain';
import { z, type ZodTypeAny } from 'zod';

/**
 * The shapes the API answers with, for its OpenAPI description (openapi.ts). Each is held to the
 * domain type the handlers return: `exact<T>()` does not compile unless the schema describes the
 * same values as T, so a field added to a domain type must be added here too. Each schema listed
 * in `components` is named in the description, under the name it is listed by.
 */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const exact =
  <T>() =>
  <S extends ZodTypeAny>(
    schema: S,
    ..._mismatch: Same<z.output<S>, T> extends true ? [] : [schemaDoesNotMatchType: never]
  ): S =>
    schema;

// New instances each time: a schema used twice in one place would be described by a reference.
const id = () => z.string().uuid();
const timestamp = () => z.string().datetime({ offset: true });
const day = () => z.string().date();

/** A time in a query, or a date, which means its start in UTC. */
export const moment = () =>
  z
    .union([z.string().datetime({ offset: true }), z.string().date()])
    .describe('A time, or a date, which means its start in UTC.');

export const ProjectRole = z.enum(PROJECT_ROLES);
export const MoscowCategory = z.enum(MOSCOW_CATEGORIES);
export const ItemState = z.enum(ITEM_STATES);
export const TaskCategory = z.enum(TASK_CATEGORIES);
export const LabelColor = z.enum(LABEL_COLORS);
export const ColumnKind = z.enum(COLUMN_KINDS);
export const RequestStatus = z.enum(REQUEST_STATUSES);
export const NotificationKind = z.enum(NOTIFICATION_KINDS);
export const TokenAccess = z.enum(TOKEN_ACCESS);

export const Person = z
  .object({ id: id(), displayName: z.string() })
  .describe('A member, as history and comments name them.');
export const PersonWithAvatar = z.object({
  id: id(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().describe('Their picture, or null to show initials.'),
});

// Accounts and projects ---------------------------------------------------------------------

export const CurrentUser = exact<d.CurrentUser>()(
  z.object({
    id: id(),
    displayName: z.string(),
    email: z.string().nullable(),
    isAdmin: z.boolean(),
    provider: z.string(),
    avatarUrl: z.string().nullable(),
  }),
);

export const AvatarCrop = exact<d.AvatarCrop>()(
  z.object({ left: z.number(), top: z.number(), size: z.number() }),
);

export const MyAvatar = exact<d.MyAvatar>()(
  z.object({ avatarUrl: z.string(), sourceUrl: z.string(), crop: AvatarCrop }),
);

export const UserSummary = exact<d.UserSummary>()(
  z.object({ id: id(), displayName: z.string(), email: z.string().nullable() }),
);

export const ProjectSummary = exact<d.ProjectSummary>()(
  z.object({
    id: id(),
    name: z.string(),
    description: z.string(),
    roles: z.array(ProjectRole).describe('The viewer’s roles in the project.'),
    canAccept: z.boolean(),
    doneRestricted: z.boolean(),
    scopeLimit: z.number().int(),
    itemCount: z.number().int(),
    archived: z.boolean(),
    version: z.number().int(),
  }),
);

export const ProjectMember = exact<d.ProjectMember>()(
  z.object({
    userId: id(),
    displayName: z.string(),
    email: z.string().nullable(),
    roles: z.array(ProjectRole),
    canAccept: z.boolean(),
    avatarUrl: z.string().nullable(),
  }),
);

export const ProjectInvitation = exact<d.ProjectInvitation>()(
  z.object({
    id: id(),
    email: z.string(),
    roles: z.array(ProjectRole),
    canAccept: z.boolean(),
    invitedBy: z.string().nullable(),
    createdAt: timestamp(),
  }),
);

export const Permissions = exact<d.Permissions>()(
  z
    .object(
      Object.fromEntries(PROJECT_ACTIONS.map((a) => [a, z.boolean()])) as Record<
        ProjectAction,
        z.ZodBoolean
      >,
    )
    .describe('What the viewer may do in the project.'),
);

export const Label = exact<d.Label>()(z.object({ id: id(), name: z.string(), color: LabelColor }));

export const ProjectDetail = exact<d.ProjectDetail>()(
  ProjectSummary.extend({
    members: z.array(ProjectMember),
    invitations: z.array(ProjectInvitation),
    permissions: Permissions,
    labels: z.array(Label),
  }),
);

export const AuthProviders = exact<d.AuthProviders>()(
  z.object({
    mock: z.object({
      enabled: z.boolean(),
      personas: z.array(
        z.object({ key: z.string(), displayName: z.string(), roles: z.array(ProjectRole) }),
      ),
    }),
    oidc: z.array(z.object({ id: z.string(), label: z.string() })),
  }),
);

export const SearchResults = exact<d.SearchResults>()(
  z.object({
    items: z.array(z.object({ id: id(), title: z.string(), state: ItemState })),
    tasks: z.array(
      z.object({ id: id(), title: z.string(), completed: z.boolean(), itemTitle: z.string() }),
    ),
  }),
);

// Backlog ------------------------------------------------------------------------------------

export const TaskCounts = exact<d.TaskCounts>()(
  z.object({ total: z.number().int(), completed: z.number().int() }),
);

export const TaskFacet = exact<d.TaskFacet>()(
  z.object({ assigneeId: z.string().uuid().nullable(), category: TaskCategory }),
);

export const BacklogItem = exact<d.BacklogItem>()(
  z.object({
    id: id(),
    projectId: id(),
    title: z.string(),
    description: z.string().describe('Markdown.'),
    category: MoscowCategory,
    rank: z.string().describe('Orders the item among the open items of its category.'),
    state: ItemState,
    archived: z.boolean(),
    version: z.number().int(),
    taskCounts: TaskCounts,
    taskFacets: z
      .array(TaskFacet)
      .describe('Who its tasks are assigned to, and of what category, one per distinct pair.'),
    activeBoard: z
      .object({ id: id(), name: z.string() })
      .nullable()
      .describe('The active Workboard whose scope includes the item.'),
    coverAttachmentId: z.string().uuid().nullable(),
    acceptedAt: timestamp()
      .nullable()
      .describe('When the item was accepted as Done; null unless it is Done.'),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }),
);

export const ItemLink = exact<d.ItemLink>()(
  z.object({ id: id(), url: z.string(), label: z.string() }),
);

export const Acceptance = exact<d.Acceptance>()(
  z.object({
    id: id(),
    acceptedBy: Person,
    acceptedAt: timestamp(),
    note: z.string(),
    invalidatedAt: timestamp().nullable(),
    invalidatedReason: z.string().nullable(),
  }),
);

export const Attachment = exact<d.Attachment>()(
  z.object({
    id: id(),
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
    uploadedBy: Person,
    createdAt: timestamp(),
    isImage: z.boolean(),
  }),
);

export const Comment = exact<d.Comment>()(
  z.object({
    id: id(),
    author: Person,
    body: z.string().describe('Markdown; @mentions name members.'),
    kind: z.enum(['comment', 'rejection']),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }),
);

export const Dependency = exact<d.Dependency>()(
  z.object({ id: id(), title: z.string(), category: MoscowCategory, state: ItemState }),
);

export const BacklogItemDetail = exact<d.BacklogItemDetail>()(
  BacklogItem.extend({
    links: z.array(ItemLink),
    attachments: z.array(Attachment),
    dependsOn: z.array(Dependency),
    dependents: z.array(Dependency),
    acceptance: Acceptance.nullable(),
    acceptanceHistory: z.array(Acceptance),
    comments: z.array(Comment),
  }),
);

export const ActivityEntry = exact<d.ActivityEntry>()(
  z.object({
    id: z.number().int(),
    action: z.string().describe('What happened, such as task.moved or item.accepted.'),
    entityType: z.string(),
    entityId: id(),
    entityTitle: z.string().nullable().describe('What it concerns, by its title as it is now.'),
    actor: Person.nullable().describe('Who did it; null when the system did.'),
    via: z.string().nullable().describe('The API token it was done with, by name.'),
    previous: z.record(z.unknown()).nullable(),
    next: z.record(z.unknown()).nullable(),
    createdAt: timestamp(),
  }),
);

export const ColumnStay = exact<d.ColumnStay>()(
  z.object({
    taskId: id(),
    taskTitle: z.string(),
    category: TaskCategory,
    itemId: id(),
    itemTitle: z.string(),
    boardId: id(),
    boardName: z.string(),
    columnId: id(),
    columnName: z.string(),
    columnKind: ColumnKind,
    enteredAt: timestamp(),
    leftAt: timestamp().nullable().describe('Null while the card is still there.'),
    hours: z.number().describe('How long it stayed, or has stayed so far.'),
  }),
);

// Tasks --------------------------------------------------------------------------------------

export const TaskPlacement = exact<d.TaskPlacement>()(
  z.object({
    boardId: id(),
    boardName: z.string(),
    columnId: id(),
    columnName: z.string(),
    inDone: z.boolean(),
    enteredAsException: z.boolean(),
  }),
);

export const Task = exact<d.Task>()(
  z.object({
    id: id(),
    projectId: id(),
    itemId: id(),
    category: TaskCategory,
    title: z.string(),
    description: z.string().describe('Markdown.'),
    assignee: PersonWithAvatar.nullable(),
    completed: z.boolean(),
    completedAt: timestamp().nullable(),
    archived: z.boolean(),
    coverAttachmentId: z.string().uuid().nullable(),
    checklist: z.object({ total: z.number().int(), done: z.number().int() }),
    labels: z.array(Label),
    dueDate: day().nullable(),
    blocked: z.boolean(),
    blockedReason: z.string(),
    placement: TaskPlacement.nullable().describe('Where it is on a Workboard; null if unplaced.'),
    pendingRequest: z
      .object({ id: id(), boardId: id(), boardName: z.string(), requesterId: id() })
      .nullable()
      .describe('A pending request to place it as out-of-scope work.'),
    version: z.number().int(),
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }),
);

export const ChecklistItem = exact<d.ChecklistItem>()(
  z.object({ id: id(), title: z.string(), done: z.boolean() }),
);

export const TaskDetail = exact<d.TaskDetail>()(
  Task.extend({
    item: z.object({ id: id(), title: z.string(), category: MoscowCategory, state: ItemState }),
    checklistItems: z.array(ChecklistItem),
    comments: z.array(Comment),
    attachments: z.array(Attachment),
    links: z.array(ItemLink),
  }),
);

export const MyTask = exact<d.MyTask>()(
  Task.extend({ itemTitle: z.string(), itemCategory: MoscowCategory }),
);

// Workboards ---------------------------------------------------------------------------------

export const BoardColumn = exact<d.BoardColumn>()(
  z.object({
    id: id(),
    name: z.string(),
    kind: ColumnKind,
    rank: z.string(),
    version: z.number().int(),
  }),
);

export const BoardCard = exact<d.BoardCard>()(
  Task.extend({
    itemTitle: z.string(),
    itemCategory: MoscowCategory,
    outOfScope: z.boolean().describe('Its item is not in the board’s scope.'),
    rank: z.string(),
  }),
);

export const ScopeItem = exact<d.ScopeItem>()(
  z.object({
    id: id(),
    title: z.string(),
    category: MoscowCategory,
    state: ItemState,
    taskCounts: TaskCounts,
    accepted: z.boolean(),
    addedAt: timestamp(),
  }),
);

export const BoardSummary = exact<d.BoardSummary>()(
  z.object({
    id: id(),
    projectId: id(),
    name: z.string(),
    description: z.string(),
    state: z.enum(['active', 'archived']),
    version: z.number().int(),
    createdAt: timestamp(),
    archivedAt: timestamp().nullable(),
    endsOn: day().nullable(),
  }),
);

export const BoardView = exact<d.BoardView>()(
  BoardSummary.extend({
    columns: z.array(BoardColumn),
    cards: z.record(z.array(BoardCard)).describe('Cards by column id, in order.'),
    scope: z.array(ScopeItem),
    scopeLimit: z.number().int(),
    counts: z.object({
      scopeItems: z.number().int(),
      acceptedItems: z.number().int(),
      outOfScopeTasks: z.number().int(),
      placedTasks: z.number().int(),
      unfinishedTasks: z.number().int(),
      pendingRequests: z.number().int(),
    }),
    nextEligible: z
      .object({
        id: id(),
        title: z.string(),
        category: MoscowCategory,
        unplacedTasks: z.number().int(),
      })
      .nullable()
      .describe('The item the priority rule would bring into scope next, if there is room.'),
  }),
);

export const WorkRequest = exact<d.WorkRequest>()(
  z.object({
    id: id(),
    boardId: id(),
    boardName: z.string(),
    task: z.object({
      id: id(),
      title: z.string(),
      category: TaskCategory,
      completed: z.boolean(),
      placed: z.boolean(),
    }),
    item: z.object({ id: id(), title: z.string() }),
    requester: Person,
    reason: z.string(),
    status: RequestStatus,
    decidedBy: Person.nullable(),
    decidedAt: timestamp().nullable(),
    decisionNote: z.string().nullable(),
    createdAt: timestamp(),
  }),
);

// Notifications ------------------------------------------------------------------------------

export const Notification = exact<d.Notification>()(
  z.object({
    id: id(),
    kind: NotificationKind,
    project: z.object({ id: id(), name: z.string() }),
    actor: PersonWithAvatar.nullable(),
    via: z.string().nullable(),
    task: z.object({ id: id(), title: z.string() }).nullable(),
    item: z.object({ id: id(), title: z.string() }).nullable(),
    detail: z.string(),
    createdAt: timestamp(),
    read: z.boolean(),
  }),
);

export const WaitingEntry = exact<d.WaitingEntry>()(
  z.object({
    kind: z.enum(['request', 'review']),
    project: z.object({ id: id(), name: z.string() }),
    item: z.object({ id: id(), title: z.string() }),
    task: z.object({ id: id(), title: z.string() }).nullable(),
    requester: Person.nullable(),
    since: timestamp(),
  }),
);

export const NotificationSummary = exact<d.NotificationSummary>()(
  z.object({
    unread: z.number().int(),
    waiting: z.array(WaitingEntry),
    notifications: z.array(Notification),
  }),
);

// Overview -----------------------------------------------------------------------------------

const count = () => z.number().int().min(0);
export const TaskProgress = exact<d.TaskProgress>()(
  z
    .object({
      total: count(),
      completed: count(),
      inProgress: count().describe('On a Workboard, past its To Do column.'),
      toDo: count().describe('In a To Do column.'),
      unplaced: count().describe('Not complete and on no board.'),
      blocked: count(),
      overdue: count().describe('Not complete, with a date before today.'),
      unassigned: count().describe('Not complete, with nobody assigned.'),
    })
    .describe('Where a set of tasks stands; archived tasks are left out.'),
);

export const OverviewItem = exact<d.OverviewItem>()(
  z.object({
    id: id(),
    title: z.string(),
    category: MoscowCategory,
    state: ItemState,
    onBoard: z.boolean(),
    tasks: TaskProgress,
  }),
);

export const ProjectOverview = exact<d.ProjectOverview>()(
  z.object({
    items: z.array(OverviewItem),
    tasksByCategory: z.object({ code: TaskProgress, assets: TaskProgress, content: TaskProgress }),
  }),
);

// API tokens ---------------------------------------------------------------------------------

export const ApiToken = exact<d.ApiToken>()(
  z.object({
    id: id(),
    name: z.string(),
    access: TokenAccess,
    createdAt: timestamp(),
    lastUsedAt: timestamp().nullable(),
  }),
);

export const CreatedToken = exact<d.CreatedToken>()(
  z.object({
    token: ApiToken,
    secret: z.string().describe('The token itself. It is shown this once; keep it safe.'),
  }),
);

/** The shapes named in the description, by name. */
export const components: Record<string, ZodTypeAny> = {
  ProjectRole,
  MoscowCategory,
  ItemState,
  TaskCategory,
  LabelColor,
  ColumnKind,
  RequestStatus,
  NotificationKind,
  TokenAccess,
  Person,
  PersonWithAvatar,
  CurrentUser,
  AvatarCrop,
  MyAvatar,
  UserSummary,
  ProjectSummary,
  ProjectMember,
  ProjectInvitation,
  Permissions,
  Label,
  ProjectDetail,
  AuthProviders,
  SearchResults,
  TaskCounts,
  TaskFacet,
  BacklogItem,
  ItemLink,
  Acceptance,
  Attachment,
  Comment,
  Dependency,
  BacklogItemDetail,
  ActivityEntry,
  ColumnStay,
  TaskPlacement,
  Task,
  ChecklistItem,
  TaskDetail,
  MyTask,
  BoardColumn,
  BoardCard,
  ScopeItem,
  BoardSummary,
  BoardView,
  WorkRequest,
  Notification,
  WaitingEntry,
  NotificationSummary,
  TaskProgress,
  OverviewItem,
  ProjectOverview,
  ApiToken,
  CreatedToken,
};
