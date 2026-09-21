import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordActivity } from './activity.ts';
import { createPool, withTransaction, type Db } from './db.ts';

/**
 * Recovery commands for whoever runs the instance, for when nobody who can fix something in the
 * application is able to sign in. Run inside the application container:
 *
 *   npm run admin -w apps/api -- <command> [arguments]
 *
 * They talk to the database directly, as "System" in project history.
 */
const USAGE = `Commands:
  list-admins                        Show who is admin.
  grant-admin <email>                Make an existing account admin.
  revoke-admin <email>               Take admin away from an account.
  projects                           List projects with their ids and Game Directors.
  add-director <email> <project-id>  Make someone a Game Director of a project. Someone who has
                                     not signed in yet gets an invitation as Game Director.`;

export async function runAdmin(db: Db, args: string[], out: (line: string) => void): Promise<void> {
  const [command, ...rest] = args;
  const email = rest[0]?.trim().toLowerCase();
  const need = (n: number) => {
    if (rest.length < n) throw new Error(`${command} needs ${n} argument(s).\n\n${USAGE}`);
  };

  switch (command) {
    case 'list-admins': {
      const res = await db.query<{ display_name: string; email: string | null }>(
        'SELECT display_name, email FROM users WHERE is_admin ORDER BY created_at',
      );
      if (!res.rowCount) out('No admins. The next sign-in with INITIAL_ADMIN_EMAIL becomes one.');
      for (const u of res.rows) out(`${u.email ?? '(no email)'}  ${u.display_name}`);
      return;
    }
    case 'grant-admin':
    case 'revoke-admin': {
      need(1);
      const res = await db.query(
        'UPDATE users SET is_admin = $2 WHERE lower(email) = $1 RETURNING id',
        [email, command === 'grant-admin'],
      );
      if (!res.rowCount)
        throw new Error(`No account has the address ${email}. They must sign in once first.`);
      out(command === 'grant-admin' ? `${email} is now admin.` : `${email} is no longer admin.`);
      return;
    }
    case 'projects': {
      const res = await db.query<{ id: string; name: string; directors: string | null }>(
        `SELECT p.id, p.name,
                string_agg(u.email, ', ' ORDER BY u.email) FILTER (WHERE u.id IS NOT NULL) AS directors
           FROM projects p
           LEFT JOIN project_memberships m ON m.project_id = p.id AND 'director' = ANY(m.roles)
           LEFT JOIN users u ON u.id = m.user_id
          WHERE p.archived_at IS NULL
          GROUP BY p.id ORDER BY p.created_at`,
      );
      for (const p of res.rows)
        out(`${p.id}  ${p.name}  (Game Directors: ${p.directors ?? 'none'})`);
      return;
    }
    case 'add-director': {
      need(2);
      const projectId = rest[1]!;
      if (!/^[0-9a-f-]{36}$/i.test(projectId))
        throw new Error(`Not a project id: ${projectId}. Run "projects" to list them.`);
      await withTransaction(db, async (tx) => {
        const project = await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [
          projectId,
        ]);
        if (!project.rowCount) throw new Error(`No project has the id ${projectId}.`);
        const user = await tx.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(email) = $1 ORDER BY created_at LIMIT 1',
          [email],
        );
        const userId = user.rows[0]?.id;
        if (!userId) {
          const inv = await tx.query<{ id: string }>(
            `INSERT INTO project_invitations (project_id, email, roles) VALUES ($1, $2, '{director}')
             ON CONFLICT (project_id, email)
             DO UPDATE SET roles = array(SELECT DISTINCT unnest(project_invitations.roles || '{director}'::project_role[]))
             RETURNING id`,
            [projectId, email],
          );
          await recordActivity(tx, {
            projectId,
            actorId: null,
            action: 'member.invited',
            entityType: 'invitation',
            entityId: inv.rows[0]!.id,
            next: { email, roles: ['director'], canAccept: false },
          });
          out(`${email} has not signed in yet; invited as Game Director.`);
          return;
        }
        const before = await tx.query<{ roles: string[] }>(
          'SELECT roles::text[] AS roles FROM project_memberships WHERE project_id = $1 AND user_id = $2',
          [projectId, userId],
        );
        const previous = before.rows[0]?.roles;
        if (previous?.includes('director')) {
          out(`${email} is already a Game Director of that project.`);
          return;
        }
        const roles = [...(previous ?? []), 'director'];
        await tx.query(
          `INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, $3)
           ON CONFLICT (project_id, user_id) DO UPDATE SET roles = EXCLUDED.roles`,
          [projectId, userId, roles],
        );
        await recordActivity(tx, {
          projectId,
          actorId: null,
          action: previous ? 'member.updated' : 'member.added',
          entityType: 'user',
          entityId: userId,
          ...(previous ? { previous: { roles: previous } } : {}),
          next: { roles },
        });
        out(`${email} is now a Game Director of that project.`);
      });
      return;
    }
    default:
      throw new Error(command ? `Unknown command: ${command}\n\n${USAGE}` : USAGE);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const db = createPool(url);
  try {
    await runAdmin(db, process.argv.slice(2), console.log);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
