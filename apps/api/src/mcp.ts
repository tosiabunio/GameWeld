import {
  MOSCOW_CATEGORIES,
  TASK_CATEGORIES,
  type ActivityEntry,
  type BacklogItem,
  type BacklogItemDetail,
  type BoardSummary,
  type BoardView,
  type ColumnStay,
  type Comment,
  type CurrentUser,
  type MyTask,
  type NotificationSummary,
  type ProjectDetail,
  type ProjectOverview,
  type ProjectSummary,
  type SearchResults,
  type Task,
  type TaskDetail,
  type TaskProgress,
  type WorkRequest,
} from '@gameweld/domain';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z, type ZodRawShape } from 'zod';

/**
 * The MCP server: GameWeld's tools for AI assistants. Each tool does what a member does in the
 * app, by calling the application's own routes as the member whose token the request came with,
 * so the same permissions and rules apply, a refusal comes back with the same reason, and every
 * change is in the history under the member's name and the token's. A read-only token is offered
 * only the tools that read. Answers are compact JSON: what an assistant needs to act, with ids.
 */

const INSTRUCTIONS = `GameWeld runs the production of a game. A project has a Backlog of items, each in a MoSCoW category (must, should, could, wont). An item is broken down into tasks of three categories: code, assets, content.

One Workboard per project is active. Its scope holds a few Backlog items, up to the project's scope limit, and they come in strictly by priority: only the next item (the first open item not yet in scope, by category and then by its place in the Backlog; get_workboard names it as nextEligible) can be brought in. To bring in another, the Backlog must be reprioritised first, or single tasks brought in as out-of-scope work. The tasks of items in scope are cards in its columns: a To Do column per task category, intermediate columns, and Done. A task of an item outside the scope goes on the board only through an out-of-scope request that a Game Director approves. When every task of an item is complete, the item is Ready for Review, and a Game Director (or a member allowed to) accepts it as Done.

The server enforces these rules and the member's permissions, and says why when it refuses: report the refusal rather than working around it. Every change is recorded in the project's history under the member's name and this token's name.

Start with list_projects; take ids from what the read tools return.`;

/** A refusal from the application, passed to the assistant as the tool's error. */
class Refused extends Error {}

/** The application's own routes, called as the member the MCP request came from. */
class MemberApi {
  constructor(
    private app: FastifyInstance,
    private headers: Record<string, string>,
  ) {}

  async call<T>(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object): Promise<T> {
    const res = await this.app.inject({
      method,
      url: `/api${url}`,
      headers: this.headers,
      ...(payload ? { payload } : {}),
    });
    const body = res.body ? (JSON.parse(res.body) as unknown) : null;
    if (res.statusCode >= 400) {
      const { message, details } = (body ?? {}) as { message?: unknown; details?: unknown };
      const reason = typeof message === 'string' ? message : `Refused (${res.statusCode})`;
      // For invalid input, which fields and why, so the assistant can correct its call.
      throw new Refused(details ? `${reason}: ${JSON.stringify(details)}` : reason);
    }
    return body as T;
  }

  get<T>(url: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const defined = Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][];
    const qs = new URLSearchParams(defined.map(([k, v]) => [k, String(v)])).toString();
    return this.call<T>('GET', qs ? `${url}?${qs}` : url);
  }

  async activeBoard(projectId: string): Promise<BoardSummary> {
    const boards = await this.get<BoardSummary[]>(`/projects/${projectId}/boards`);
    const active = boards.find((b) => b.state === 'active');
    if (!active) throw new Refused('The project has no active Workboard.');
    return active;
  }
}

// Compact shapes -----------------------------------------------------------------------------

const person = (p: { id: string; displayName: string } | null) =>
  p ? { id: p.id, name: p.displayName } : null;

function compactTask(t: Task) {
  return {
    id: t.id,
    title: t.title,
    category: t.category,
    assignee: person(t.assignee),
    completed: t.completed,
    ...(t.archived ? { archived: true } : {}),
    board: t.placement ? { id: t.placement.boardId, column: t.placement.columnName } : null,
    ...(t.pendingRequest ? { pendingRequest: t.pendingRequest.id } : {}),
    ...(t.blocked ? { blocked: t.blockedReason || true } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(t.labels.length ? { labels: t.labels.map((l) => l.name) } : {}),
    ...(t.checklist.total ? { checklist: `${t.checklist.done}/${t.checklist.total}` } : {}),
    version: t.version,
  };
}

function compactItem(i: BacklogItem) {
  return {
    id: i.id,
    title: i.title,
    category: i.category,
    state: i.state,
    tasks: `${i.taskCounts.completed}/${i.taskCounts.total} complete`,
    onBoard: i.activeBoard?.name ?? null,
    ...(i.acceptedAt ? { acceptedAt: i.acceptedAt } : {}),
    version: i.version,
  };
}

/** How far back get_backlog lists Done items unless asked: Done only grows. */
const RECENT_DONE_DAYS = 30;

const compactComment = (c: Comment) => ({
  id: c.id,
  author: c.author.displayName,
  ...(c.kind === 'rejection' ? { rejection: true } : {}),
  body: c.body,
  at: c.createdAt,
});

function compactBoard(b: BoardView) {
  return {
    id: b.id,
    name: b.name,
    state: b.state,
    ...(b.endsOn ? { endsOn: b.endsOn } : {}),
    scopeLimit: b.scopeLimit,
    scope: b.scope.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      state: s.state,
      tasks: `${s.taskCounts.completed}/${s.taskCounts.total} complete`,
    })),
    nextEligible: b.nextEligible,
    pendingRequests: b.counts.pendingRequests,
    columns: b.columns.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      cards: (b.cards[c.id] ?? []).map((card) => ({
        taskId: card.id,
        title: card.title,
        item: card.itemTitle,
        category: card.category,
        assignee: card.assignee?.displayName ?? null,
        ...(card.outOfScope ? { outOfScope: true } : {}),
        ...(card.blocked ? { blocked: card.blockedReason || true } : {}),
        ...(card.dueDate ? { dueDate: card.dueDate } : {}),
        ...(card.labels.length ? { labels: card.labels.map((l) => l.name) } : {}),
      })),
    })),
  };
}

/** Tasks counted together, with waiting as one number: in To Do or on no board. */
function progress(list: TaskProgress[]) {
  const total = (key: keyof TaskProgress) => list.reduce((n, p) => n + p[key], 0);
  return {
    total: total('total'),
    completed: total('completed'),
    inProgress: total('inProgress'),
    waiting: total('toDo') + total('unplaced'),
    inToDo: total('toDo'),
    onNoBoard: total('unplaced'),
    blocked: total('blocked'),
    overdue: total('overdue'),
    unassigned: total('unassigned'),
  };
}

const compactEntry = (e: ActivityEntry) => ({
  id: e.id,
  at: e.createdAt,
  action: e.action,
  who: e.actor?.displayName ?? 'system',
  ...(e.via ? { via: e.via } : {}),
  entity: { type: e.entityType, id: e.entityId, title: e.entityTitle },
  ...(e.previous ? { before: e.previous } : {}),
  ...(e.next ? { after: e.next } : {}),
});

// Tools --------------------------------------------------------------------------------------

interface Tool<S extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Changes something: not offered to a read-only token. */
  writes?: true;
  run: (api: MemberApi, args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>;
}
const tool = <S extends ZodRawShape>(t: Tool<S>): Tool => t as unknown as Tool;

const projectId = z.string().uuid().describe('The project, from list_projects.');
const version = z
  .number()
  .int()
  .optional()
  .describe(
    'The version you read it at, so a change made since is not overwritten; leave out to change it as it is now.',
  );

const TOOLS: Tool[] = [
  tool({
    name: 'list_projects',
    title: 'Projects',
    description: 'You, and the projects you are a member of, with your roles in each.',
    input: {},
    run: async (api) => {
      const [me, projects] = await Promise.all([
        api.get<CurrentUser>('/me'),
        api.get<ProjectSummary[]>('/projects'),
      ]);
      return {
        me: { id: me.id, name: me.displayName },
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          yourRoles: p.roles,
          items: p.itemCount,
        })),
      };
    },
  }),
  tool({
    name: 'get_project',
    title: 'Project',
    description:
      'A project: its members with their ids and roles, its labels, its scope limit, its active Workboard, and what you may do in it.',
    input: { projectId },
    run: async (api, { projectId }) => {
      const [p, boards] = await Promise.all([
        api.get<ProjectDetail>(`/projects/${projectId}`),
        api.get<BoardSummary[]>(`/projects/${projectId}/boards`),
      ]);
      const active = boards.find((b) => b.state === 'active');
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        scopeLimit: p.scopeLimit,
        doneRestrictedToTesters: p.doneRestricted,
        activeBoard: active ? { id: active.id, name: active.name, endsOn: active.endsOn } : null,
        youMay: Object.entries(p.permissions)
          .filter(([, allowed]) => allowed)
          .map(([action]) => action),
        members: p.members.map((m) => ({
          id: m.userId,
          name: m.displayName,
          roles: m.roles,
          ...(m.canAccept ? { canAccept: true } : {}),
        })),
        labels: p.labels.map((l) => ({ id: l.id, name: l.name })),
      };
    },
  }),
  tool({
    name: 'get_backlog',
    title: 'Backlog',
    description: `The Backlog: open items by MoSCoW category, in priority order, then the items Ready for Review, and the items accepted as Done since acceptedSince, newest first. Each with how many of its tasks are complete and whether it is on the Workboard. Done only grows, so older Done items are counted (olderDone), not listed; pass an earlier acceptedSince for them, such as the start of the month for what was accepted this month.`,
    input: {
      projectId,
      acceptedSince: z
        .union([z.string().datetime({ offset: true }), z.string().date()])
        .optional()
        .describe(
          `List the Done items accepted from this date or time on; the last ${RECENT_DONE_DAYS} days unless given.`,
        ),
    },
    run: async (api, { projectId, acceptedSince }) => {
      const items = await api.get<BacklogItem[]>(`/projects/${projectId}/backlog`);
      const lane = (pick: (i: BacklogItem) => boolean) => items.filter(pick).map(compactItem);
      const since = acceptedSince
        ? new Date(acceptedSince).getTime()
        : Date.now() - RECENT_DONE_DAYS * 86_400_000;
      const done = items
        .filter((i) => i.state === 'done')
        .sort((a, b) => (b.acceptedAt ?? '').localeCompare(a.acceptedAt ?? ''));
      const recent = done.filter((i) => new Date(i.acceptedAt ?? 0).getTime() >= since);
      return {
        ...Object.fromEntries(
          MOSCOW_CATEGORIES.map((c) => [c, lane((i) => i.state === 'open' && i.category === c)]),
        ),
        readyForReview: lane((i) => i.state === 'ready_for_review'),
        done: recent.map(compactItem),
        ...(done.length > recent.length ? { olderDone: done.length - recent.length } : {}),
      };
    },
  }),
  tool({
    name: 'get_overview',
    title: 'Overview',
    description:
      'The project at a glance, as its Overview shows it: how many items are open, ready for review, and done; how many tasks are complete, in progress (on a Workboard past To Do), waiting (in To Do or on no board), blocked, overdue, and unassigned; the same by priority and by kind of work; and every item with where its tasks stand. The quickest start for a question about status.',
    input: { projectId },
    run: async (api, { projectId }) => {
      const o = await api.get<ProjectOverview>(`/projects/${projectId}/overview`);
      const itemsIn = (state: string) => o.items.filter((i) => i.state === state).length;
      return {
        items: {
          total: o.items.length,
          open: itemsIn('open'),
          readyForReview: itemsIn('ready_for_review'),
          done: itemsIn('done'),
        },
        tasks: progress(o.items.map((i) => i.tasks)),
        byPriority: Object.fromEntries(
          MOSCOW_CATEGORIES.map((c) => {
            const of = o.items.filter((i) => i.category === c);
            return [c, { items: of.length, tasks: progress(of.map((i) => i.tasks)) }];
          }),
        ),
        byKind: Object.fromEntries(
          TASK_CATEGORIES.map((c) => [c, progress([o.tasksByCategory[c]])]),
        ),
        itemList: o.items.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          state: i.state,
          ...(i.onBoard ? { onBoard: true } : {}),
          tasks: `${i.tasks.completed}/${i.tasks.total} complete`,
          ...(i.tasks.inProgress ? { inProgress: i.tasks.inProgress } : {}),
          ...(i.tasks.toDo + i.tasks.unplaced ? { waiting: i.tasks.toDo + i.tasks.unplaced } : {}),
          ...(i.tasks.blocked ? { blocked: i.tasks.blocked } : {}),
          ...(i.tasks.overdue ? { overdue: i.tasks.overdue } : {}),
        })),
      };
    },
  }),
  tool({
    name: 'get_item',
    title: 'Backlog item',
    description:
      'A Backlog item with its breakdown: its description, its tasks and where each is, its links, dependencies, acceptance, and comments.',
    input: { projectId, itemId: z.string().uuid() },
    run: async (api, { projectId, itemId }) => {
      const [i, tasks] = await Promise.all([
        api.get<BacklogItemDetail>(`/projects/${projectId}/backlog/${itemId}`),
        api.get<Task[]>(`/projects/${projectId}/backlog/${itemId}/tasks`),
      ]);
      return {
        ...compactItem(i),
        description: i.description,
        tasks: tasks.map(compactTask),
        links: i.links.map((l) => ({ url: l.url, label: l.label })),
        dependsOn: i.dependsOn.map((d) => ({ id: d.id, title: d.title, state: d.state })),
        dependents: i.dependents.map((d) => ({ id: d.id, title: d.title, state: d.state })),
        acceptance: i.acceptance
          ? {
              by: i.acceptance.acceptedBy.displayName,
              at: i.acceptance.acceptedAt,
              note: i.acceptance.note,
            }
          : null,
        comments: i.comments.map(compactComment),
      };
    },
  }),
  tool({
    name: 'get_task',
    title: 'Task',
    description:
      'A task with its description, checklist, comments, links, labels, and where it is on the Workboard.',
    input: { projectId, taskId: z.string().uuid() },
    run: async (api, { projectId, taskId }) => {
      const t = await api.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`);
      return {
        ...compactTask(t),
        description: t.description,
        item: { id: t.item.id, title: t.item.title, state: t.item.state },
        labels: t.labels.map((l) => ({ id: l.id, name: l.name })),
        checklist: t.checklistItems,
        comments: t.comments.map(compactComment),
        links: t.links.map((l) => ({ url: l.url, label: l.label })),
        attachments: t.attachments.map((a) => a.fileName),
      };
    },
  }),
  tool({
    name: 'get_workboard',
    title: 'Workboard',
    description:
      'The active Workboard, or another by id: the items in its scope, the item the priority rule would bring in next, and its columns with their cards in order.',
    input: {
      projectId,
      boardId: z
        .string()
        .uuid()
        .optional()
        .describe('An archived board; the active one unless given.'),
    },
    run: async (api, { projectId, boardId }) => {
      const board = boardId
        ? await api.get<BoardView>(`/projects/${projectId}/boards/${boardId}`)
        : await api.get<BoardView | null>(`/projects/${projectId}/board`);
      return board
        ? compactBoard(board)
        : { board: null, note: 'The project has no active Workboard.' };
    },
  }),
  tool({
    name: 'list_workboards',
    title: 'Workboards',
    description: 'Every Workboard of the project, the archived ones included.',
    input: { projectId },
    run: async (api, { projectId }) =>
      (await api.get<BoardSummary[]>(`/projects/${projectId}/boards`)).map((b) => ({
        id: b.id,
        name: b.name,
        state: b.state,
        createdAt: b.createdAt,
        archivedAt: b.archivedAt,
        endsOn: b.endsOn,
      })),
  }),
  tool({
    name: 'get_waiting_for_me',
    title: 'Waiting for me',
    description:
      'Across your projects: what waits for your decision (out-of-scope requests, items to accept), and your newest notifications.',
    input: {},
    run: async (api) => {
      const n = await api.get<NotificationSummary>('/notifications');
      return {
        waiting: n.waiting.map((w) => ({
          kind: w.kind,
          project: w.project,
          item: w.item,
          ...(w.task ? { task: w.task } : {}),
          ...(w.requester ? { requester: w.requester.displayName } : {}),
          since: w.since,
        })),
        unread: n.unread,
        notifications: n.notifications.map((x) => ({
          kind: x.kind,
          project: x.project.name,
          who: x.actor?.displayName ?? 'GameWeld',
          ...(x.via ? { via: x.via } : {}),
          task: x.task,
          item: x.item,
          ...(x.detail ? { detail: x.detail } : {}),
          at: x.createdAt,
          read: x.read,
        })),
      };
    },
  }),
  tool({
    name: 'get_my_tasks',
    title: 'My tasks',
    description: 'Your unfinished tasks in a project, in the order you keep them.',
    input: { projectId },
    run: async (api, { projectId }) =>
      (await api.get<MyTask[]>(`/projects/${projectId}/my-tasks`)).map((t) => ({
        ...compactTask(t),
        item: t.itemTitle,
      })),
  }),
  tool({
    name: 'search',
    title: 'Search',
    description:
      'Items and tasks whose title or description contains the words, at most 8 of each.',
    input: { projectId, query: z.string().min(1).max(100) },
    run: (api, { projectId, query }) =>
      api.get<SearchResults>(`/projects/${projectId}/search`, { q: query }),
  }),
  tool({
    name: 'get_history',
    title: 'History',
    description:
      'The project’s history, newest first: every change with who made it, through which token, and the fields it touched before and after. Filter by time, person, action, or one item (with its tasks), task, or Workboard. Actions are like task.moved, task.completed, task.updated, item.accepted, item.rejected, item.reopened, scope.added, request.created; task.* matches every task action. Page back with before.',
    input: {
      projectId,
      from: z.string().optional().describe('ISO date or time: only from then on.'),
      to: z.string().optional().describe('ISO date or time: only before then.'),
      actorId: z.string().uuid().optional().describe('Only what this member did.'),
      actions: z.string().optional().describe('Comma-separated, such as task.moved,item.rejected.'),
      entityType: z.enum(['backlog_item', 'task', 'workboard']).optional(),
      entityId: z.string().uuid().optional(),
      before: z.number().int().optional().describe('Only entries older than this entry id.'),
      limit: z.number().int().min(1).max(500).optional().describe('100 unless given.'),
    },
    run: async (api, { projectId, ...query }) =>
      (await api.get<ActivityEntry[]>(`/projects/${projectId}/activity`, query)).map(compactEntry),
  }),
  tool({
    name: 'get_column_stays',
    title: 'Column stays',
    description:
      'How long cards stayed in each Workboard column, with hours, oldest first: where work waits and for how long. Filter by board, task, or time.',
    input: {
      projectId,
      boardId: z.string().uuid().optional(),
      taskId: z.string().uuid().optional(),
      from: z.string().optional().describe('ISO date or time: stays that had not ended by then.'),
      to: z.string().optional().describe('ISO date or time: stays that began before then.'),
    },
    run: async (api, { projectId, ...query }) =>
      (await api.get<ColumnStay[]>(`/projects/${projectId}/column-stays`, query)).map((s) => ({
        task: s.taskTitle,
        taskId: s.taskId,
        category: s.category,
        item: s.itemTitle,
        board: s.boardName,
        column: s.columnName,
        kind: s.columnKind,
        enteredAt: s.enteredAt,
        leftAt: s.leftAt,
        hours: s.hours,
      })),
  }),
  tool({
    name: 'list_requests',
    title: 'Out-of-scope requests',
    description: 'The out-of-scope requests on the active Workboard, pending ones first.',
    input: { projectId },
    run: async (api, { projectId }) => {
      const board = await api.activeBoard(projectId);
      return (
        await api.get<WorkRequest[]>(`/projects/${projectId}/boards/${board.id}/requests`)
      ).map((r) => ({
        id: r.id,
        status: r.status,
        task: { id: r.task.id, title: r.task.title },
        item: r.item,
        requester: r.requester.displayName,
        reason: r.reason,
        ...(r.decidedBy ? { decidedBy: r.decidedBy.displayName, note: r.decisionNote } : {}),
        at: r.createdAt,
      }));
    },
  }),

  // Changes ----------------------------------------------------------------------------------

  tool({
    name: 'create_item',
    title: 'Add a Backlog item',
    description: 'Add an item to the end of its MoSCoW category. Needs the Game Director role.',
    writes: true,
    input: {
      projectId,
      title: z.string().min(1).max(500),
      category: z.enum(MOSCOW_CATEGORIES),
      description: z.string().max(50_000).optional().describe('Markdown.'),
    },
    run: async (api, { projectId, ...item }) =>
      compactItem(await api.call<BacklogItem>('POST', `/projects/${projectId}/backlog`, item)),
  }),
  tool({
    name: 'update_item',
    title: 'Edit a Backlog item',
    description: 'Change an item’s title or description. Needs the Game Director role.',
    writes: true,
    input: {
      projectId,
      itemId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(50_000).optional().describe('Markdown; replaces the old one.'),
      version,
    },
    run: async (api, { projectId, itemId, version, ...fields }) => {
      const url = `/projects/${projectId}/backlog/${itemId}`;
      const current = version ?? (await api.get<BacklogItem>(url)).version;
      return compactItem(
        await api.call<BacklogItem>('PATCH', url, { version: current, ...fields }),
      );
    },
  }),
  tool({
    name: 'move_item',
    title: 'Reprioritise a Backlog item',
    description:
      'Move an open item to another MoSCoW category, or to another place in its own: between afterId and beforeId, or to the end with neither. Needs the Game Director role.',
    writes: true,
    input: {
      projectId,
      itemId: z.string().uuid(),
      category: z.enum(MOSCOW_CATEGORIES),
      afterId: z.string().uuid().optional().describe('The item it goes after.'),
      beforeId: z.string().uuid().optional().describe('The item it goes before.'),
    },
    run: async (api, { projectId, itemId, ...place }) =>
      compactItem(
        await api.call<BacklogItem>('POST', `/projects/${projectId}/backlog/${itemId}/move`, place),
      ),
  }),
  tool({
    name: 'create_tasks',
    title: 'Break an item down',
    description:
      'Add tasks to a Backlog item, one or several: its breakdown into code, assets, and content work. Tasks of an item in the Workboard’s scope go straight to their To Do columns. They are added one by one; if one is refused, the ones before it stay and the answer says which failed.',
    writes: true,
    input: {
      projectId,
      itemId: z.string().uuid(),
      tasks: z
        .array(
          z.object({
            title: z.string().min(1).max(500),
            category: z.enum(TASK_CATEGORIES),
            description: z.string().max(50_000).optional().describe('Markdown.'),
            assigneeId: z.string().uuid().optional().describe('A member, from get_project.'),
          }),
        )
        .min(1)
        .max(30),
    },
    run: async (api, { projectId, itemId, tasks }) => {
      const created = [];
      for (const task of tasks) {
        try {
          created.push(
            compactTask(
              await api.call<Task>('POST', `/projects/${projectId}/backlog/${itemId}/tasks`, task),
            ),
          );
        } catch (err) {
          if (!(err instanceof Refused) || created.length === 0) throw err;
          return { created, failed: { title: task.title, reason: err.message } };
        }
      }
      return { created };
    },
  }),
  tool({
    name: 'update_task',
    title: 'Edit a task',
    description:
      'Change a task: its title, description, assignee, labels, due date, or whether it is blocked and why. Send only what changes.',
    writes: true,
    input: {
      projectId,
      taskId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(50_000).optional().describe('Markdown; replaces the old one.'),
      assigneeId: z.string().uuid().nullable().optional().describe('A member, or null for nobody.'),
      labelIds: z.array(z.string().uuid()).optional().describe('All its labels, from get_project.'),
      dueDate: z.string().date().nullable().optional().describe('YYYY-MM-DD, or null for none.'),
      blocked: z.boolean().optional(),
      blockedReason: z.string().max(500).optional(),
      version,
    },
    run: async (api, { projectId, taskId, version, ...fields }) => {
      const url = `/projects/${projectId}/tasks/${taskId}`;
      const current = version ?? (await api.get<TaskDetail>(url)).version;
      return compactTask(await api.call<TaskDetail>('PATCH', url, { version: current, ...fields }));
    },
  }),
  tool({
    name: 'set_task_completed',
    title: 'Complete or reopen a task',
    description:
      'Complete a task, which moves its card to Done, or reopen it. Reopening returns its item to Open if it was Ready for Review or Done.',
    writes: true,
    input: { projectId, taskId: z.string().uuid(), completed: z.boolean() },
    run: async (api, { projectId, taskId, completed }) =>
      compactTask(
        await api.call<TaskDetail>(
          'POST',
          `/projects/${projectId}/tasks/${taskId}/${completed ? 'complete' : 'reopen'}`,
        ),
      ),
  }),
  tool({
    name: 'add_checklist_items',
    title: 'Add checklist steps',
    description: 'Add steps to the end of a task’s checklist.',
    writes: true,
    input: {
      projectId,
      taskId: z.string().uuid(),
      steps: z.array(z.string().min(1).max(500)).min(1).max(30),
    },
    run: async (api, { projectId, taskId, steps }) => {
      let checklist: unknown = [];
      for (const title of steps)
        checklist = await api.call('POST', `/projects/${projectId}/tasks/${taskId}/checklist`, {
          title,
        });
      return checklist;
    },
  }),
  tool({
    name: 'add_to_scope',
    title: 'Bring an item into the Workboard’s scope',
    description:
      'Bring the next item in priority (get_workboard names it as nextEligible) into the active Workboard’s scope, within its scope limit; its tasks go to their To Do columns. Needs the Game Director role.',
    writes: true,
    input: { projectId, itemId: z.string().uuid() },
    run: async (api, { projectId, itemId }) => {
      const board = await api.activeBoard(projectId);
      const view = await api.call<BoardView>(
        'POST',
        `/projects/${projectId}/boards/${board.id}/scope`,
        { itemId },
      );
      const { scope, scopeLimit, nextEligible } = compactBoard(view);
      return { scope, scopeLimit, nextEligible };
    },
  }),
  tool({
    name: 'place_task',
    title: 'Put a task on the Workboard',
    description:
      'Put an unplaced task of an item in scope on the active Workboard, in its To Do column. A task of an item outside the scope needs request_out_of_scope instead.',
    writes: true,
    input: { projectId, taskId: z.string().uuid() },
    run: async (api, { projectId, taskId }) => {
      const board = await api.activeBoard(projectId);
      await api.call('POST', `/projects/${projectId}/boards/${board.id}/placements`, { taskId });
      return compactTask(await api.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`));
    },
  }),
  tool({
    name: 'move_card',
    title: 'Move a card',
    description:
      'Move a task’s card to a column of its Workboard, by the column’s name or id: between the cards afterTaskId and beforeTaskId, or to the end with neither. Moving into or out of Done completes or reopens the task.',
    writes: true,
    input: {
      projectId,
      taskId: z.string().uuid(),
      column: z.string().min(1).describe('The column’s name, such as Done, or its id.'),
      afterTaskId: z.string().uuid().optional(),
      beforeTaskId: z.string().uuid().optional(),
    },
    run: async (api, { projectId, taskId, column, afterTaskId, beforeTaskId }) => {
      const task = await api.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`);
      if (!task.placement) throw new Refused('The task is not on a Workboard.');
      const boardId = task.placement.boardId;
      const board = await api.get<BoardView>(`/projects/${projectId}/boards/${boardId}`);
      const wanted = column.trim().toLowerCase();
      const target =
        board.columns.find((c) => c.id === column) ??
        board.columns.find((c) => c.name.toLowerCase() === wanted);
      if (!target)
        throw new Refused(
          `No column “${column}” on ${board.name}. Its columns: ${board.columns.map((c) => c.name).join(', ')}.`,
        );
      await api.call('POST', `/projects/${projectId}/boards/${boardId}/placements/${taskId}/move`, {
        columnId: target.id,
        afterId: afterTaskId ?? null,
        beforeId: beforeTaskId ?? null,
      });
      return compactTask(await api.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`));
    },
  }),
  tool({
    name: 'add_comment',
    title: 'Comment',
    description:
      'Comment on a task or a Backlog item; give one of taskId or itemId. Markdown; members named with @ and their name are notified.',
    writes: true,
    input: {
      projectId,
      taskId: z.string().uuid().optional(),
      itemId: z.string().uuid().optional(),
      body: z.string().min(1).max(20_000),
    },
    run: async (api, { projectId, taskId, itemId, body }) => {
      if (!taskId === !itemId) throw new Refused('Give either taskId or itemId.');
      const owner = taskId ? `tasks/${taskId}` : `backlog/${itemId}`;
      return compactComment(
        await api.call<Comment>('POST', `/projects/${projectId}/${owner}/comments`, { body }),
      );
    },
  }),
  tool({
    name: 'request_out_of_scope',
    title: 'Ask for out-of-scope work',
    description:
      'Ask a Game Director to let a task of an item outside the active Workboard’s scope onto the board: an unplaced task (taskId), or a new one described in newTask. Give a reason.',
    writes: true,
    input: {
      projectId,
      taskId: z.string().uuid().optional(),
      newTask: z
        .object({
          itemId: z.string().uuid(),
          category: z.enum(TASK_CATEGORIES),
          title: z.string().min(1).max(500),
        })
        .optional(),
      reason: z.string().max(2000),
    },
    run: async (api, { projectId, ...request }) => {
      const board = await api.activeBoard(projectId);
      const r = await api.call<WorkRequest>(
        'POST',
        `/projects/${projectId}/boards/${board.id}/requests`,
        request,
      );
      return { id: r.id, status: r.status, task: r.task, item: r.item, board: r.boardName };
    },
  }),
];

/** Tool names, by whether they change anything, for tests and the documentation. */
export const MCP_TOOLS = {
  read: TOOLS.filter((t) => !t.writes).map((t) => t.name),
  write: TOOLS.filter((t) => t.writes).map((t) => t.name),
};

/** A server for one MCP request, acting as the member the request came from. */
export function createMcpServer(app: FastifyInstance, req: FastifyRequest): McpServer {
  const server = new McpServer(
    { name: 'gameweld', title: 'GameWeld', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );
  const headers: Record<string, string> = {};
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  const api = new MemberApi(app, headers);
  const mayWrite = req.token?.access !== 'read';

  for (const t of TOOLS) {
    if (t.writes && !mayWrite) continue;
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: {
          readOnlyHint: !t.writes,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await t.run(api, args as never);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (err) {
          if (!(err instanceof Refused)) throw err;
          return { isError: true, content: [{ type: 'text' as const, text: err.message }] };
        }
      },
    );
  }
  return server;
}
