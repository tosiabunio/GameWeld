import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('a member makes API tokens, uses them, sees their changes in history, and revokes one', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByTestId('current-user').click();
  const profile = page.getByRole('dialog', { name: 'Your profile' });
  const tokens = profile.getByRole('region', { name: 'API tokens' });
  await expect(tokens).toBeVisible();
  const row = (name: string) =>
    tokens.getByTestId('token').filter({ has: page.getByText(name, { exact: true }) });

  // A read-only token, shown once.
  await tokens.getByLabel('Name').fill('Script');
  await tokens.getByRole('button', { name: 'Make a token' }).click();
  const secret = (await tokens.getByTestId('token-secret').textContent())!;
  expect(secret).toMatch(/^gw_/);
  // And the commands that add the GameWeld skill from this instance.
  await expect(tokens.getByTestId('token-skill-command')).toHaveText(
    '/plugin marketplace add http://localhost:3100/api/claude/marketplace.json\n/plugin install gameweld@gameweld',
  );
  // With the command that connects Claude Code to this instance's MCP server.
  await expect(tokens.getByTestId('token-mcp-command')).toContainText(
    `claude mcp add --transport http --scope user gameweld http://localhost:3100/api/mcp --header "Authorization: Bearer ${secret}"`,
  );
  // The token speaks for the member, whatever cookie comes with it, and only reads.
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const me = await page.request.get('/api/me', { headers: bearer(secret) });
  expect((await me.json()).displayName).toBe('Dana Director');
  const refused = await page.request.post('/api/projects', {
    headers: bearer(secret),
    data: { name: 'Not with this token' },
  });
  expect(refused.status()).toBe(403);
  await tokens.getByRole('button', { name: 'Done' }).click();
  await expect(tokens.getByTestId('token-secret')).toHaveCount(0);
  await expect(row('Script')).toContainText('Read only');

  // A read-write token makes a change, which history credits to the member through it.
  await tokens.getByLabel('Name').fill('Claude');
  await tokens.getByLabel('Access').selectOption({ label: 'Read and write' });
  await tokens.getByRole('button', { name: 'Make a token' }).click();
  const writer = (await tokens.getByTestId('token-secret').textContent())!;
  const projects = await (
    await page.request.get('/api/projects', { headers: bearer(writer) })
  ).json();
  const demo = projects.find((p: { name: string }) => p.name === 'Demo project');
  const created = await page.request.post(`/api/projects/${demo.id}/backlog`, {
    headers: bearer(writer),
    data: { title: 'Written by an assistant', category: 'could' },
  });
  expect(created.status()).toBe(201);
  await profile.getByRole('button', { name: 'Close profile' }).click();

  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByTestId('lane-could')
    .getByRole('link', { name: 'Written by an assistant', exact: true })
    .click();
  await page.getByRole('button', { name: /History/ }).click();
  const entry = page.getByTestId('history-entry').filter({ hasText: 'created the item' });
  await expect(entry).toContainText('Dana Director');
  await expect(entry.getByTestId('history-via')).toHaveText(' · via Claude');

  // Revoked, it stops working at once.
  await page.getByTestId('current-user').click();
  const claude = row('Claude');
  await expect(claude).toContainText('last used');
  await tokens.getByRole('button', { name: 'Revoke Claude' }).click();
  await expect(claude).toHaveCount(0);
  await expect(row('Script')).toBeVisible();
  const after = await page.request.get('/api/me', { headers: bearer(writer) });
  expect(after.status()).toBe(401);
});
