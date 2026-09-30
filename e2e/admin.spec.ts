import { expect, test, type BrowserContext } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://gameweld:gameweld@localhost:5433/gameweld_test';

/** An account as Google sign-in leaves one; with a context, that context is signed in as it. */
async function teamMember(
  email: string,
  { admin = false, context = null as BrowserContext | null },
) {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const user = await db.query<{ id: string }>(
      'INSERT INTO users (display_name, email, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [email.split('@')[0], email, admin],
    );
    const id = user.rows[0]!.id;
    await db.query(
      `INSERT INTO identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)`,
      [randomUUID(), id, email],
    );
    if (!context) return;
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [createHash('sha256').update(token).digest('hex'), id],
    );
    await context.addCookies([{ name: 'gw_session', value: token, url: 'http://localhost:3100' }]);
  } finally {
    await db.end();
  }
}

// Personas are never admins, so the Administration page is reached as someone of a team.
test('an admin makes teachers Observers of a group’s project, and takes it back', async ({
  page,
  context,
}) => {
  const run = randomUUID().slice(0, 8);
  const teacher = `teacher-${run}@example.com`;
  await teamMember(`admin-${run}@example.com`, { admin: true, context });
  await page.goto('/');
  const created = await page.request.post('/api/projects', { data: { name: `Group ${run}` } });
  expect(created.status()).toBe(201);

  await page.getByTestId('admin-link').click();
  await expect(page.getByRole('heading', { name: 'Administration', level: 2 })).toBeVisible();
  const form = page.getByRole('form', { name: 'Invite' });
  await form.getByLabel('Email').fill(teacher);
  await form.getByLabel('As').selectOption('observer');
  await expect(form.getByRole('button', { name: 'Invite' })).toBeDisabled();
  await form.getByLabel(`Group ${run}`).check();
  await form.getByRole('button', { name: 'Invite' }).click();
  await expect(form.getByRole('status')).toContainText(`${teacher} is invited`);

  const pending = page.getByTestId('project-invitations').getByRole('row', { name: teacher });
  await expect(pending).toContainText(`Group ${run}`);
  await expect(pending).toContainText('Observer');
  await pending.getByRole('button', { name: 'Cancel invitation' }).click();
  await expect(page.getByTestId('project-invitations').getByText(teacher)).toHaveCount(0);

  // A teacher who has signed in before observes at once, and can be taken off the project.
  const known = `known-${run}@example.com`;
  await teamMember(known, {});
  await form.getByLabel('Email').fill(known);
  await form.getByLabel(`Group ${run}`).check();
  await form.getByRole('button', { name: 'Invite' }).click();
  await expect(form.getByRole('status')).toContainText(`${known} has it now`);
  const row = page.getByTestId(`person-${known}`);
  await expect(row).toContainText(`Group ${run} · Observer`);
  await row.getByRole('button', { name: `Stop known-${run} observing Group ${run}` }).click();
  await expect(row).not.toContainText(`Group ${run}`);
});
