import { PERSONAS } from '@gameweld/domain';
import { generateKeyBetween } from 'fractional-indexing';
import type { Db } from './db.ts';
import { withTransaction } from './db.ts';

/**
 * Seeds the mock personas and a demo project with the worked example from specification
 * Section 17. Runs only when the database has no users, so it is safe to call on every start.
 * Returns true when it seeded.
 */
export async function seedDemo(db: Db): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    // Serialize concurrent starters (two replicas, or parallel test files) on one lock so the
    // second one sees the first one's data instead of seeding twice.
    await tx.query('SELECT pg_advisory_xact_lock(727001)');
    const existing = await tx.query('SELECT 1 FROM users LIMIT 1');
    if (existing.rowCount) return false;

    // Personas -> users + mock identities.
    const userIds = new Map<string, string>();
    for (const p of PERSONAS) {
      const user = await tx.query<{ id: string }>(
        'INSERT INTO users (display_name, email, is_admin) VALUES ($1, $2, $3) RETURNING id',
        [p.displayName, p.email, p.key === 'director'],
      );
      const id = user.rows[0]!.id;
      userIds.set(p.key, id);
      await tx.query(
        'INSERT INTO identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4)',
        ['mock', p.key, id, p.email],
      );
    }
    const director = userIds.get('director')!;

    // Demo project with all personas as members.
    const project = await tx.query<{ id: string }>(
      `INSERT INTO projects (name, description, done_restricted, scope_limit)
       VALUES ('Demo project', 'Seeded example from specification Section 17.', false, 3) RETURNING id`,
    );
    const projectId = project.rows[0]!.id;
    for (const p of PERSONAS) {
      await tx.query(
        'INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, $3)',
        [projectId, userIds.get(p.key), p.roles],
      );
    }

    // Backlog items.
    let rank: string | null = null;
    const item = async (title: string, category: string, description: string) => {
      rank = generateKeyBetween(rank, null);
      const res = await tx.query<{ id: string }>(
        `INSERT INTO backlog_items (project_id, title, description, category, rank)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [projectId, title, description, category, rank],
      );
      return res.rows[0]!.id;
    };
    const ranged = await item(
      'Ranged enemy',
      'must',
      'An enemy that attacks from a distance. Free-form description.',
    );
    const flying = await item(
      'Flying enemy',
      'must',
      'An enemy that moves through the air and swoops at the player.',
    );
    await item('Boss arena', 'should', 'A dedicated space for the first boss encounter.');
    await item(
      'Improve level iteration tooling',
      'could',
      'Supporting production work with an independent purpose.',
    );

    // Tasks (Section 17 steps 2 and 5).
    const task = async (itemId: string, category: string, title: string) => {
      const res = await tx.query<{ id: string }>(
        `INSERT INTO tasks (project_id, item_id, category, title) VALUES ($1, $2, $3, $4) RETURNING id`,
        [projectId, itemId, category, title],
      );
      return res.rows[0]!.id;
    };
    const rangedTasks = [
      await task(ranged, 'code', 'Targeting'),
      await task(ranged, 'assets', 'Attack animation'),
      await task(ranged, 'content', 'Configure and place the enemy'),
    ];
    await task(flying, 'code', 'Flight path steering');
    await task(flying, 'assets', 'Swoop animation');

    // Active Workboard "September production" with the standard columns and Ranged enemy in scope.
    const board = await tx.query<{ id: string }>(
      `INSERT INTO workboards (project_id, name, description)
       VALUES ($1, 'September production', 'Active board for the demo project.') RETURNING id`,
      [projectId],
    );
    const boardId = board.rows[0]!.id;
    const columns: Record<string, string> = {};
    let colRank: string | null = null;
    for (const [kind, name] of [
      ['todo_code', 'To Do · Code'],
      ['todo_assets', 'To Do · Assets'],
      ['todo_content', 'To Do · Content'],
      ['intermediate', 'Making'],
      ['intermediate', 'Check in game'],
      ['done', 'Done'],
    ] as const) {
      colRank = generateKeyBetween(colRank, null);
      const res = await tx.query<{ id: string }>(
        'INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, $2, $3, $4) RETURNING id',
        [boardId, name, kind, colRank],
      );
      if (kind !== 'intermediate') columns[kind] = res.rows[0]!.id;
    }
    await tx.query(
      'INSERT INTO workboard_scope (board_id, item_id, added_by) VALUES ($1, $2, $3)',
      [boardId, ranged, director],
    );
    const todoFor: Record<string, string> = {
      code: columns['todo_code']!,
      assets: columns['todo_assets']!,
      content: columns['todo_content']!,
    };
    for (const [i, taskId] of rangedTasks.entries()) {
      const category = (['code', 'assets', 'content'] as const)[i]!;
      await tx.query(
        `INSERT INTO task_placements (task_id, board_id, column_id, rank, placed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [taskId, boardId, todoFor[category], generateKeyBetween(null, null), director],
      );
    }

    await tx.query(
      `INSERT INTO activity (project_id, actor_id, action, entity_type, entity_id, next)
       VALUES ($1, $2, 'project.seeded', 'project', $1, $3)`,
      [projectId, director, JSON.stringify({ source: 'seedDemo' })],
    );
    return true;
  });
}
