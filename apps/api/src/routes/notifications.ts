import type {
  Notification,
  NotificationKind,
  NotificationSummary,
  WaitingEntry,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.ts';
import { avatarUrl } from '../avatars.ts';
import { badRequest } from '../errors.ts';

const readSchema = z.object({ ids: z.array(z.string().uuid()).max(500).optional() });
const LISTED = 50;

/**
 * A member's notifications span their projects, so these routes stand beside the project-scoped
 * ones and check membership in their queries: what a project sent stops showing to someone who
 * has left it.
 */
export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/notifications',
    { preHandler: requireUser },
    async (req): Promise<NotificationSummary> => {
      const userId = req.user!.id;
      const listed = await db.query<{
        id: string;
        kind: NotificationKind;
        project_id: string;
        project_name: string;
        actor_id: string | null;
        actor_name: string | null;
        actor_avatar_id: string | null;
        task_id: string | null;
        task_title: string | null;
        item_id: string | null;
        item_title: string | null;
        detail: string;
        created_at: Date;
        read_at: Date | null;
      }>(
        `SELECT n.id, n.kind, n.project_id, p.name AS project_name, n.actor_id,
              u.display_name AS actor_name, u.avatar_id AS actor_avatar_id,
              n.task_id, t.title AS task_title, n.item_id, b.title AS item_title,
              n.detail, n.created_at, n.read_at
         FROM notifications n
         JOIN projects p ON p.id = n.project_id AND p.archived_at IS NULL
         JOIN project_memberships m ON m.project_id = n.project_id AND m.user_id = n.user_id
         LEFT JOIN users u ON u.id = n.actor_id
         LEFT JOIN tasks t ON t.id = n.task_id
         LEFT JOIN backlog_items b ON b.id = n.item_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC, n.id
        LIMIT ${LISTED}`,
        [userId],
      );
      const notifications: Notification[] = listed.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        project: { id: r.project_id, name: r.project_name },
        actor:
          r.actor_id && r.actor_name
            ? {
                id: r.actor_id,
                displayName: r.actor_name,
                avatarUrl: avatarUrl(r.actor_id, r.actor_avatar_id),
              }
            : null,
        task: r.task_id && r.task_title !== null ? { id: r.task_id, title: r.task_title } : null,
        item: r.item_id && r.item_title !== null ? { id: r.item_id, title: r.item_title } : null,
        detail: r.detail,
        createdAt: r.created_at.toISOString(),
        read: r.read_at !== null,
      }));
      const unread = Number(
        (
          await db.query<{ n: string }>(
            `SELECT count(*) AS n FROM notifications n
             JOIN projects p ON p.id = n.project_id AND p.archived_at IS NULL
             JOIN project_memberships m ON m.project_id = n.project_id AND m.user_id = n.user_id
            WHERE n.user_id = $1 AND n.read_at IS NULL`,
            [userId],
          )
        ).rows[0]!.n,
      );

      // What waits for this member's decision, read from the state itself rather than from
      // events: it is there until they decide, and gone as soon as anyone does.
      const waiting = await db.query<{
        kind: WaitingEntry['kind'];
        project_id: string;
        project_name: string;
        item_id: string;
        item_title: string;
        task_id: string | null;
        task_title: string | null;
        requester_id: string | null;
        requester_name: string | null;
        since: Date;
      }>(
        `SELECT 'request' AS kind, p.id AS project_id, p.name AS project_name,
              b.id AS item_id, b.title AS item_title, t.id AS task_id, t.title AS task_title,
              ru.id AS requester_id, ru.display_name AS requester_name, r.created_at AS since
         FROM work_requests r
         JOIN workboards w ON w.id = r.board_id AND w.state = 'active'
         JOIN projects p ON p.id = w.project_id AND p.archived_at IS NULL
         JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
              AND 'director' = ANY(m.roles)
         JOIN tasks t ON t.id = r.task_id
         JOIN backlog_items b ON b.id = t.item_id
         JOIN users ru ON ru.id = r.requester_id
        WHERE r.status = 'pending'
       UNION ALL
       SELECT 'review', p.id, p.name, b.id, b.title, NULL, NULL, NULL, NULL, b.updated_at
         FROM backlog_items b
         JOIN projects p ON p.id = b.project_id AND p.archived_at IS NULL
         JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
              AND ('director' = ANY(m.roles) OR m.can_accept)
        WHERE b.state = 'ready_for_review' AND b.archived_at IS NULL
        ORDER BY since`,
        [userId],
      );
      return {
        unread,
        notifications,
        waiting: waiting.rows.map((r) => ({
          kind: r.kind,
          project: { id: r.project_id, name: r.project_name },
          item: { id: r.item_id, title: r.item_title },
          task: r.task_id && r.task_title !== null ? { id: r.task_id, title: r.task_title } : null,
          requester:
            r.requester_id && r.requester_name
              ? { id: r.requester_id, displayName: r.requester_name }
              : null,
          since: r.since.toISOString(),
        })),
      };
    },
  );

  /** Marks the named notifications read, or all of the member's when none are named. */
  app.post('/notifications/read', { preHandler: requireUser }, async (req, reply) => {
    const parsed = readSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Invalid request', parsed.error.flatten());
    await db.query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [req.user!.id, parsed.data.ids ?? null],
    );
    return reply.status(204).send();
  });
};
