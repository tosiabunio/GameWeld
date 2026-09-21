import {
  LABEL_COLORS,
  TASK_CATEGORIES,
  type LabelColor,
  type TaskCategory,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { generateNKeysBetween } from 'fractional-indexing';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest } from '../errors.ts';
import { recalculateItemState } from '../services/readiness.ts';

/** A project's data belongs to its team: everything in it can be taken out, and a Trello board can be brought in. */

const group = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row[key] as string | null;
    if (id) map.set(id, [...(map.get(id) ?? []), row]);
  }
  return (id: string) => map.get(id) ?? [];
};
const without = <T extends Record<string, unknown>>(row: T, ...keys: string[]) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

/**
 * The whole project as one document: settings, members, labels, items with their tasks and
 * everything attached to either, Workboards with their columns, scope, and placements, requests,
 * and the activity history. People appear by name and e-mail. Attachments are listed with their
 * names and sizes; the files themselves stay in storage.
 */
async function exportProject(db: Queryable, projectId: string) {
  const q = async <T extends Record<string, unknown>>(sql: string) =>
    (await db.query<T>(sql, [projectId])).rows;
  const person = (alias: string, prefix: string) =>
    `${alias}.display_name AS "${prefix}Name", ${alias}.email AS "${prefix}Email"`;

  const [project] = await q(
    `SELECT name, description, done_restricted AS "doneRestricted", scope_limit AS "scopeLimit",
            created_at AS "createdAt", archived_at AS "archivedAt" FROM projects WHERE id = $1`,
  );
  const members = await q(
    `SELECT u.display_name AS "displayName", u.email, m.roles::text[] AS roles, m.can_accept AS "canAccept"
       FROM project_memberships m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.created_at`,
  );
  const labels = await q(
    `SELECT name, color FROM project_labels WHERE project_id = $1 ORDER BY lower(name)`,
  );
  const items = await q(
    `SELECT id, title, description, category, state, rank, created_at AS "createdAt",
            updated_at AS "updatedAt", archived_at AS "archivedAt"
       FROM backlog_items WHERE project_id = $1 ORDER BY category, rank COLLATE "C", id`,
  );
  const tasks = await q(
    `SELECT t.id, t.item_id, t.title, t.description, t.category, t.completed,
            t.completed_at AS "completedAt", t.archived_at AS "archivedAt",
            to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate", t.blocked, t.blocked_reason AS "blockedReason",
            t.created_at AS "createdAt", ${person('u', 'assignee')},
            (SELECT coalesce(array_agg(l.name ORDER BY lower(l.name)), '{}') FROM task_labels tl
               JOIN project_labels l ON l.id = tl.label_id WHERE tl.task_id = t.id) AS labels
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = $1 ORDER BY t.created_at, t.id`,
  );
  const checklist = await q(
    `SELECT k.task_id, k.title, k.done FROM task_checklist_items k JOIN tasks t ON t.id = k.task_id
      WHERE t.project_id = $1 ORDER BY k.rank, k.id`,
  );
  const comments = await q(
    `SELECT c.task_id, c.item_id, c.kind, c.body, c.created_at AS "createdAt", ${person('u', 'author')}
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.project_id = $1 ORDER BY c.created_at, c.id`,
  );
  const links = await q(
    `SELECT task_id, item_id, url, label FROM links WHERE project_id = $1 ORDER BY created_at, id`,
  );
  const attachments = await q(
    `SELECT a.task_id, a.item_id, a.file_name AS "fileName", a.content_type AS "contentType",
            a.size_bytes::int AS "sizeBytes", a.created_at AS "createdAt", ${person('u', 'uploadedBy')}
       FROM attachments a JOIN users u ON u.id = a.uploaded_by WHERE a.project_id = $1 ORDER BY a.created_at, a.id`,
  );
  const acceptances = await q(
    `SELECT a.item_id, a.accepted_at AS "acceptedAt", a.note, a.invalidated_at AS "invalidatedAt",
            a.invalidated_reason AS "invalidatedReason", ${person('u', 'acceptedBy')}
       FROM acceptances a JOIN backlog_items b ON b.id = a.item_id JOIN users u ON u.id = a.accepted_by
      WHERE b.project_id = $1 ORDER BY a.accepted_at`,
  );
  const dependencies = await q(
    `SELECT d.item_id, d.depends_on_item_id AS "dependsOnItemId" FROM item_dependencies d
       JOIN backlog_items b ON b.id = d.item_id WHERE b.project_id = $1`,
  );
  const boards = await q(
    `SELECT id, name, description, state, to_char(ends_on, 'YYYY-MM-DD') AS "endsOn",
            created_at AS "createdAt", archived_at AS "archivedAt"
       FROM workboards WHERE project_id = $1 ORDER BY created_at`,
  );
  const columns = await q(
    `SELECT c.board_id, c.id, c.name, c.kind, c.deleted_at AS "deletedAt" FROM board_columns c
       JOIN workboards w ON w.id = c.board_id WHERE w.project_id = $1 ORDER BY c.rank COLLATE "C"`,
  );
  const scope = await q(
    `SELECT s.board_id, s.item_id AS "itemId", s.added_at AS "addedAt" FROM workboard_scope s
       JOIN workboards w ON w.id = s.board_id WHERE w.project_id = $1 ORDER BY s.added_at`,
  );
  const placements = await q(
    `SELECT p.board_id, p.task_id AS "taskId", c.name AS "column", p.is_current AS "current",
            p.entered_as_exception AS "enteredAsException", p.placed_at AS "placedAt",
            p.removed_at AS "removedAt", p.removed_reason AS "removedReason"
       FROM task_placements p JOIN workboards w ON w.id = p.board_id
       JOIN board_columns c ON c.id = coalesce(p.last_column_id, p.column_id)
      WHERE w.project_id = $1 ORDER BY p.placed_at`,
  );
  const requests = await q(
    `SELECT r.board_id AS "boardId", r.task_id AS "taskId", r.reason, r.status, r.created_at AS "createdAt",
            r.decided_at AS "decidedAt", r.decision_note AS "decisionNote",
            ${person('ru', 'requester')}, ${person('du', 'decidedBy')}
       FROM work_requests r JOIN workboards w ON w.id = r.board_id
       JOIN users ru ON ru.id = r.requester_id LEFT JOIN users du ON du.id = r.decided_by
      WHERE w.project_id = $1 ORDER BY r.created_at`,
  );
  const activity = await q(
    `SELECT a.created_at AS "at", a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
            a.previous, a.next, ${person('u', 'actor')}
       FROM activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = $1 ORDER BY a.id`,
  );

  const of = {
    checklist: group(checklist, 'task_id'),
    taskComments: group(comments, 'task_id'),
    itemComments: group(comments, 'item_id'),
    taskLinks: group(links, 'task_id'),
    itemLinks: group(links, 'item_id'),
    taskFiles: group(attachments, 'task_id'),
    itemFiles: group(attachments, 'item_id'),
    tasks: group(tasks, 'item_id'),
    acceptances: group(acceptances, 'item_id'),
    dependencies: group(dependencies, 'item_id'),
    columns: group(columns, 'board_id'),
    scope: group(scope, 'board_id'),
    placements: group(placements, 'board_id'),
  };
  const bare = (rows: Record<string, unknown>[]) =>
    rows.map((r) => without(r, 'task_id', 'item_id', 'board_id'));

  return {
    format: 'gameweld-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    members,
    labels,
    items: items.map((item) => ({
      ...item,
      dependsOn: of.dependencies(item.id as string).map((d) => d.dependsOnItemId),
      acceptances: bare(of.acceptances(item.id as string)),
      comments: bare(of.itemComments(item.id as string)),
      links: bare(of.itemLinks(item.id as string)),
      attachments: bare(of.itemFiles(item.id as string)),
      tasks: of.tasks(item.id as string).map((task) => ({
        ...without(task, 'item_id'),
        checklist: bare(of.checklist(task.id as string)),
        comments: bare(of.taskComments(task.id as string)),
        links: bare(of.taskLinks(task.id as string)),
        attachments: bare(of.taskFiles(task.id as string)),
      })),
    })),
    workboards: boards.map((board) => ({
      ...board,
      columns: bare(of.columns(board.id as string)),
      scope: bare(of.scope(board.id as string)),
      placements: bare(of.placements(board.id as string)),
    })),
    requests,
    activity,
  };
}

/** The mark at the start of a file that tells spreadsheets it is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** One row per task, for a spreadsheet. */
async function exportTasksCsv(db: Queryable, projectId: string): Promise<string> {
  const rows = await db.query<Record<string, string | boolean | null>>(
    `SELECT b.title AS "Item", b.category AS "Priority", b.state AS "Item state", t.title AS "Task",
            t.category AS "Category", coalesce(u.display_name, '') AS "Assignee",
            CASE WHEN t.archived_at IS NOT NULL THEN 'deleted' WHEN t.completed THEN 'complete'
                 WHEN p.task_id IS NOT NULL THEN 'on board' ELSE 'unplaced' END AS "Status",
            coalesce(w.name, '') AS "Workboard", coalesce(c.name, '') AS "Column",
            (SELECT coalesce(string_agg(l.name, ', ' ORDER BY lower(l.name)), '') FROM task_labels tl
               JOIN project_labels l ON l.id = tl.label_id WHERE tl.task_id = t.id) AS "Labels",
            coalesce(to_char(t.due_date, 'YYYY-MM-DD'), '') AS "Due",
            CASE WHEN t.blocked THEN 'yes' ELSE '' END AS "Blocked", t.blocked_reason AS "Blocked reason",
            (SELECT count(*) FILTER (WHERE k.done) || '/' || count(*) FROM task_checklist_items k
              WHERE k.task_id = t.id) AS "Checklist",
            to_char(t.created_at, 'YYYY-MM-DD') AS "Created",
            coalesce(to_char(t.completed_at, 'YYYY-MM-DD'), '') AS "Completed"
       FROM tasks t
       JOIN backlog_items b ON b.id = t.item_id
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN task_placements p ON p.task_id = t.id AND p.is_current
       LEFT JOIN workboards w ON w.id = p.board_id
       LEFT JOIN board_columns c ON c.id = p.column_id
      WHERE t.project_id = $1
      ORDER BY b.category, b.rank COLLATE "C", t.created_at, t.id`,
    [projectId],
  );
  const header = rows.fields.map((f) => f.name);
  // A cell that starts like a formula is text: a spreadsheet would otherwise run it.
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header, ...rows.rows.map((r) => header.map((h) => r[h]))];
  return `${BOM}${lines.map((line) => line.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------------------------
// Trello

const trelloSchema = z.object({
  /** What a Trello card becomes. */
  mode: z.enum(['cards_as_tasks', 'cards_as_items']),
  /** The kind of the tasks made, where a card's labels do not say. */
  category: z.enum(TASK_CATEGORIES).default('code'),
  board: z
    .object({
      name: z.string().optional(),
      lists: z.array(
        z.object({ id: z.string(), name: z.string(), closed: z.boolean().optional() }),
      ),
      cards: z.array(
        z
          .object({
            id: z.string(),
            idList: z.string(),
            name: z.string(),
            desc: z.string().optional(),
            closed: z.boolean().optional(),
            due: z.string().nullish(),
            dueComplete: z.boolean().optional(),
            pos: z.number().optional(),
            shortUrl: z.string().optional(),
            idLabels: z.array(z.string()).optional(),
            idChecklists: z.array(z.string()).optional(),
            attachments: z
              .array(
                z.object({ url: z.string().optional(), name: z.string().optional() }).passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      ),
      labels: z
        .array(
          z
            .object({ id: z.string(), name: z.string().optional(), color: z.string().nullish() })
            .passthrough(),
        )
        .optional(),
      checklists: z
        .array(
          z
            .object({
              id: z.string(),
              idCard: z.string(),
              name: z.string().optional(),
              checkItems: z.array(
                z
                  .object({
                    name: z.string(),
                    state: z.string().optional(),
                    pos: z.number().optional(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        )
        .optional(),
      actions: z.array(z.object({ type: z.string() }).passthrough()).optional(),
    })
    .passthrough(),
});

const TRELLO_COLORS: Record<string, LabelColor> = {
  red: 'red',
  pink: 'red',
  orange: 'orange',
  yellow: 'yellow',
  lime: 'green',
  green: 'green',
  sky: 'teal',
  blue: 'blue',
  purple: 'purple',
  black: 'gray',
};
const labelColor = (trello: string | null | undefined): LabelColor => {
  const base = (trello ?? '').split('_')[0]!;
  return (
    TRELLO_COLORS[base] ??
    (LABEL_COLORS.includes(base as LabelColor) ? (base as LabelColor) : 'gray')
  );
};
/** A Trello label that names a kind of work decides the task's category. */
const categoryOf = (names: string[], fallback: TaskCategory): TaskCategory => {
  for (const name of names.map((n) => n.toLowerCase())) {
    if (/\b(code|coding|programming|dev|tech)\b/.test(name)) return 'code';
    if (/\b(art|assets?|audio|sound|animation|model(l?ing)?|vfx|ui)\b/.test(name)) return 'assets';
    if (/\b(content|design|level|writing|narrative|quest)\b/.test(name)) return 'content';
  }
  return fallback;
};
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const transferRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/projects/:projectId/export.json',
    projectRoute('project.settings', {
      id: 'exportProject',
      summary: 'Download the whole project as JSON',
      description:
        'Items, tasks, checklists, comments, links, the names of attachments, Workboards with their placements, requests, and the full history, with people named by name and address.',
      response: { content: 'application/json', description: 'The project, as a file to keep' },
    }),
    async (req, reply) => {
      const { project } = req.access!;
      const name = project.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'project';
      return reply
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="gameweld-${name}.json"`)
        .send(JSON.stringify(await exportProject(db, project.id), null, 2));
    },
  );

  app.get(
    '/projects/:projectId/export/tasks.csv',
    projectRoute('project.settings', {
      id: 'exportTasks',
      summary: 'Download the project’s tasks as CSV',
      description: 'One row per task, for a spreadsheet.',
      response: { content: 'text/csv', description: 'The tasks' },
    }),
    async (req, reply) => {
      const { project } = req.access!;
      const name = project.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'project';
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="gameweld-${name}-tasks.csv"`)
        .send(await exportTasksCsv(db, project.id));
    },
  );

  /**
   * Brings a Trello board's export into this project, in one transaction. Trello has cards in
   * lists; GameWeld has tasks under backlog items. Which a card is depends on how the team used
   * Trello, so the importer is told:
   *
   * - cards_as_tasks: a list becomes a backlog item and its cards become that item's tasks, with
   *   their labels, date, checklists, comments, and links.
   * - cards_as_items: a card becomes a backlog item and the entries of its checklists become its
   *   tasks; what an item cannot hold (labels, a date) is written into its description.
   *
   * Archived lists and cards are left out. Everything arrives unplaced: what enters a Workboard
   * is the team's decision here, not Trello's.
   */
  app.post(
    '/projects/:projectId/import/trello',
    {
      ...projectRoute('project.settings', {
        id: 'importTrello',
        summary: 'Import a Trello board from its JSON export',
        description:
          'Lists become items and cards their tasks (cards_as_tasks), or cards become items (cards_as_items). Labels, dates, checklists, comments, and links come along; members and attachments do not. Up to 25 MB.',
        body: trelloSchema,
        response: {
          status: 201,
          schema: z.object({
            items: z.number().int(),
            tasks: z.number().int(),
            labels: z.number().int(),
            checklistItems: z.number().int(),
            comments: z.number().int(),
            links: z.number().int(),
          }),
          description: 'What was imported',
        },
      }),
      bodyLimit: 25 * 1024 * 1024,
    },
    async (req, reply) => {
      const parsed = trelloSchema.safeParse(req.body);
      if (!parsed.success)
        throw badRequest(
          'This does not look like a Trello board export (JSON).',
          parsed.error.flatten(),
        );
      const { mode, category: fallback, board } = parsed.data;
      const projectId = req.access!.project.id;
      const actorId = req.user!.id;

      const lists = board.lists.filter((l) => !l.closed);
      const open = new Set(lists.map((l) => l.id));
      const cards = board.cards
        .filter((c) => !c.closed && open.has(c.idList))
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      const labelById = new Map((board.labels ?? []).map((l) => [l.id, l]));
      const checklistsOf = (cardId: string) =>
        (board.checklists ?? [])
          .filter((k) => k.idCard === cardId)
          .flatMap((k) =>
            [...k.checkItems]
              .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
              .map((i) => ({ title: clip(i.name.trim(), 500), done: i.state === 'complete' })),
          )
          .filter((i) => i.title !== '');
      const commentsOf = (cardId: string) =>
        (board.actions ?? [])
          .filter((a) => a.type === 'commentCard')
          .map(
            (a) =>
              a as {
                date?: string;
                data?: { text?: string; card?: { id?: string } };
                memberCreator?: { fullName?: string };
              },
          )
          .filter((a) => a.data?.card?.id === cardId && a.data.text)
          .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
          .map(
            (a) =>
              `**${a.memberCreator?.fullName ?? 'Someone'}** on Trello${a.date ? `, ${a.date.slice(0, 10)}` : ''}:\n\n${a.data!.text}`,
          );
      const linksOf = (card: (typeof cards)[number]) =>
        [
          ...(card.attachments ?? []).map((a) => ({ url: a.url, label: a.name ?? '' })),
          { url: card.shortUrl, label: 'The card on Trello' },
        ].filter((l): l is { url: string; label: string } => /^https?:\/\//.test(l.url ?? ''));
      const labelNames = (card: (typeof cards)[number]) =>
        (card.idLabels ?? [])
          .map((id) => labelById.get(id))
          .map((l) => (l?.name?.trim() || l?.color || '').trim())
          .filter((n) => n !== '');

      const counts = { items: 0, tasks: 0, labels: 0, checklistItems: 0, comments: 0, links: 0 };
      await withTransaction(db, async (tx) => {
        await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
        const lastRank = (
          await tx.query<{ rank: string }>(
            `SELECT rank FROM backlog_items WHERE project_id = $1 AND category = 'should'
              ORDER BY rank COLLATE "C" DESC LIMIT 1`,
            [projectId],
          )
        ).rows[0]?.rank;

        const insertItem = async (title: string, description: string, rank: string) =>
          (
            await tx.query<{ id: string }>(
              `INSERT INTO backlog_items (project_id, title, description, category, rank)
               VALUES ($1, $2, $3, 'should', $4) RETURNING id`,
              [projectId, clip(title.trim() || 'Untitled', 500), clip(description, 50_000), rank],
            )
          ).rows[0]!.id;
        const insertTask = async (
          itemId: string,
          t: {
            title: string;
            description?: string;
            category: TaskCategory;
            done: boolean;
            due?: string | null;
          },
        ) =>
          (
            await tx.query<{ id: string }>(
              `INSERT INTO tasks (project_id, item_id, category, title, description, completed, completed_at, completed_by, due_date)
               VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() END, CASE WHEN $6 THEN $7::uuid END, $8::date) RETURNING id`,
              [
                projectId,
                itemId,
                t.category,
                clip(t.title.trim() || 'Untitled', 500),
                clip(t.description ?? '', 50_000),
                t.done,
                actorId,
                t.due ? t.due.slice(0, 10) : null,
              ],
            )
          ).rows[0]!.id;
        const insertComments = async (
          owner: { itemId?: string; taskId?: string },
          bodies: string[],
        ) => {
          for (const body of bodies) {
            await tx.query(
              'INSERT INTO comments (project_id, item_id, task_id, author_id, body) VALUES ($1, $2, $3, $4, $5)',
              [projectId, owner.itemId ?? null, owner.taskId ?? null, actorId, clip(body, 20_000)],
            );
            counts.comments++;
          }
        };
        const insertLinks = async (
          owner: { itemId?: string; taskId?: string },
          links: { url: string; label: string }[],
        ) => {
          for (const link of links) {
            await tx.query(
              'INSERT INTO links (project_id, item_id, task_id, url, label, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [
                projectId,
                owner.itemId ?? null,
                owner.taskId ?? null,
                clip(link.url, 2000),
                clip(link.label, 200),
                actorId,
              ],
            );
            counts.links++;
          }
        };

        const itemIds: string[] = [];
        if (mode === 'cards_as_tasks') {
          // The project's labels, by lowercase name, gaining Trello's as they are met.
          const known = new Map(
            (
              await tx.query<{ id: string; name: string }>(
                'SELECT id, name FROM project_labels WHERE project_id = $1',
                [projectId],
              )
            ).rows.map((l) => [l.name.toLowerCase(), l.id]),
          );
          const labelId = async (trelloId: string): Promise<string | null> => {
            const label = labelById.get(trelloId);
            const name = clip((label?.name?.trim() || label?.color || '').trim(), 40);
            if (name === '') return null;
            const had = known.get(name.toLowerCase());
            if (had) return had;
            const created = await tx.query<{ id: string }>(
              'INSERT INTO project_labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING id',
              [projectId, name, labelColor(label?.color)],
            );
            known.set(name.toLowerCase(), created.rows[0]!.id);
            counts.labels++;
            return created.rows[0]!.id;
          };

          const ranks = generateNKeysBetween(lastRank ?? null, null, lists.length);
          for (const [i, list] of lists.entries()) {
            const listCards = cards.filter((c) => c.idList === list.id);
            if (listCards.length === 0) continue;
            const itemId = await insertItem(
              list.name,
              `Imported from the Trello list “${list.name}”${board.name ? ` of “${board.name}”` : ''}.`,
              ranks[i]!,
            );
            itemIds.push(itemId);
            counts.items++;
            for (const card of listCards) {
              const taskId = await insertTask(itemId, {
                title: card.name,
                description: card.desc ?? '',
                category: categoryOf(labelNames(card), fallback),
                done: card.dueComplete === true,
                due: card.due ?? null,
              });
              counts.tasks++;
              for (const id of new Set(card.idLabels ?? [])) {
                const label = await labelId(id);
                if (label)
                  await tx.query(
                    'INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [taskId, label],
                  );
              }
              const steps = checklistsOf(card.id);
              const stepRanks = generateNKeysBetween(null, null, steps.length);
              for (const [s, step] of steps.entries()) {
                await tx.query(
                  'INSERT INTO task_checklist_items (task_id, title, done, rank) VALUES ($1, $2, $3, $4)',
                  [taskId, step.title, step.done, stepRanks[s]!],
                );
                counts.checklistItems++;
              }
              await insertComments({ taskId }, commentsOf(card.id));
              await insertLinks({ taskId }, linksOf(card));
            }
          }
        } else {
          const ranks = generateNKeysBetween(lastRank ?? null, null, cards.length);
          const listName = new Map(lists.map((l) => [l.id, l.name]));
          for (const [i, card] of cards.entries()) {
            const notes = [
              `From the Trello list “${listName.get(card.idList)}”.`,
              labelNames(card).length > 0 ? `Labels: ${labelNames(card).join(', ')}.` : '',
              card.due
                ? `Due ${card.due.slice(0, 10)}${card.dueComplete ? ' (marked complete)' : ''}.`
                : '',
            ].filter((n) => n !== '');
            const itemId = await insertItem(
              card.name,
              [card.desc ?? '', notes.join(' ')].filter((p) => p.trim() !== '').join('\n\n'),
              ranks[i]!,
            );
            itemIds.push(itemId);
            counts.items++;
            for (const step of checklistsOf(card.id)) {
              await insertTask(itemId, {
                title: step.title,
                category: categoryOf(labelNames(card), fallback),
                done: step.done,
              });
              counts.tasks++;
            }
            await insertComments({ itemId }, commentsOf(card.id));
            await insertLinks({ itemId }, linksOf(card));
          }
        }

        await recordActivity(tx, {
          projectId,
          actorId,
          action: 'project.imported',
          entityType: 'project',
          entityId: projectId,
          next: { source: 'trello', board: board.name ?? null, mode, ...counts },
        });
        // An item whose tasks all came in finished is ready for review, like any other.
        for (const itemId of itemIds)
          await recalculateItemState(tx, itemId, actorId, 'imported from Trello');
      });
      return reply.status(201).send(counts);
    },
  );
};
