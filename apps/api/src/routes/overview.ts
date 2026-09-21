import type {
  ItemState,
  MoscowCategory,
  OverviewItem,
  ProjectOverview,
  TaskCategory,
  TaskProgress,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { projectRoute } from '../authz.ts';
import * as schema from '../schemas.ts';

/** How each set of tasks is counted: one row per task, with where it is now. */
const progressColumns = `
  count(t.id) AS total,
  count(t.id) FILTER (WHERE t.completed) AS completed,
  count(t.id) FILTER (WHERE NOT t.completed AND c.kind = 'intermediate') AS in_progress,
  count(t.id) FILTER (WHERE NOT t.completed AND c.kind IN ('todo_code', 'todo_assets', 'todo_content')) AS to_do,
  count(t.id) FILTER (WHERE NOT t.completed AND p.task_id IS NULL) AS unplaced,
  count(t.id) FILTER (WHERE NOT t.completed AND t.blocked) AS blocked,
  count(t.id) FILTER (WHERE NOT t.completed AND t.due_date < current_date) AS overdue,
  count(t.id) FILTER (WHERE NOT t.completed AND t.assignee_id IS NULL) AS unassigned`;

const taskJoins = `
  LEFT JOIN task_placements p ON p.task_id = t.id AND p.is_current
  LEFT JOIN board_columns c ON c.id = p.column_id`;

interface ProgressRow {
  total: string;
  completed: string;
  in_progress: string;
  to_do: string;
  unplaced: string;
  blocked: string;
  overdue: string;
  unassigned: string;
}

const toProgress = (r: ProgressRow): TaskProgress => ({
  total: Number(r.total),
  completed: Number(r.completed),
  inProgress: Number(r.in_progress),
  toDo: Number(r.to_do),
  unplaced: Number(r.unplaced),
  blocked: Number(r.blocked),
  overdue: Number(r.overdue),
  unassigned: Number(r.unassigned),
});

/** The project at a glance: every item with where its tasks stand, and the tasks by category. */
export const overviewRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/projects/:projectId/overview',
    projectRoute('project.view', {
      id: 'getOverview',
      summary: 'The project at a glance: where the tasks of every item stand',
      description:
        'Every Backlog item that is not archived, in Backlog order, with its tasks counted by where they are: complete, in progress on a Workboard, in a To Do column, or on no board, and how many unfinished ones are blocked, overdue, or unassigned. The same counts by task category. Archived tasks are left out.',
      response: schema.ProjectOverview,
    }),
    async (req): Promise<ProjectOverview> => {
      const projectId = req.access!.project.id;
      const [items, categories] = await Promise.all([
        db.query<
          ProgressRow & {
            id: string;
            title: string;
            category: MoscowCategory;
            state: ItemState;
            on_board: boolean;
          }
        >(
          `SELECT b.id, b.title, b.category, b.state,
                  EXISTS (SELECT 1 FROM workboard_scope s JOIN workboards w ON w.id = s.board_id
                           WHERE s.item_id = b.id AND w.state = 'active') AS on_board,
                  ${progressColumns}
             FROM backlog_items b
             LEFT JOIN tasks t ON t.item_id = b.id AND t.archived_at IS NULL
             ${taskJoins}
            WHERE b.project_id = $1 AND b.archived_at IS NULL
            GROUP BY b.id
            ORDER BY b.category, b.rank, b.id`,
          [projectId],
        ),
        db.query<ProgressRow & { category: TaskCategory }>(
          `SELECT t.category, ${progressColumns}
             FROM tasks t
             JOIN backlog_items b ON b.id = t.item_id AND b.archived_at IS NULL
             ${taskJoins}
            WHERE t.project_id = $1 AND t.archived_at IS NULL
            GROUP BY t.category`,
          [projectId],
        ),
      ]);
      const none: ProgressRow = {
        total: '0',
        completed: '0',
        in_progress: '0',
        to_do: '0',
        unplaced: '0',
        blocked: '0',
        overdue: '0',
        unassigned: '0',
      };
      const byCategory = (category: TaskCategory) =>
        toProgress(categories.rows.find((r) => r.category === category) ?? none);
      return {
        items: items.rows.map((r): OverviewItem => ({
          id: r.id,
          title: r.title,
          category: r.category,
          state: r.state,
          onBoard: r.on_board,
          tasks: toProgress(r),
        })),
        tasksByCategory: {
          code: byCategory('code'),
          assets: byCategory('assets'),
          content: byCategory('content'),
        },
      };
    },
  );
};
