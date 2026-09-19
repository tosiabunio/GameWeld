import { expect, test } from '@playwright/test';
import { signIn, switchPersona } from './helpers.ts';

const trello = {
  name: 'Indie board',
  lists: [
    { id: 'l1', name: 'Combat', closed: false },
    { id: 'l2', name: 'Menus', closed: false },
  ],
  labels: [{ id: 'lab1', name: 'Bug', color: 'red' }],
  cards: [
    { id: 'c1', idList: 'l1', name: 'Sword swing', pos: 1, idLabels: ['lab1'] },
    { id: 'c2', idList: 'l1', name: 'Dodge roll', pos: 2, desc: 'With **i-frames**.' },
    { id: 'c3', idList: 'l2', name: 'Pause menu', pos: 1 },
  ],
  checklists: [
    { id: 'k1', idCard: 'c2', checkItems: [{ name: 'Animation', state: 'complete', pos: 1 }] },
  ],
  actions: [],
};

test('a Director imports a Trello board and exports the project', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Transfer project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const member = page.getByRole('form', { name: 'Add member' });
  await member.getByLabel('Email').fill('developer@gameweld.local');
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  const settings = page.url();

  const form = page.getByRole('form', { name: 'Import from Trello' });
  await expect(form.getByRole('button', { name: 'Import' })).toBeDisabled();
  // A file that is not JSON says what to do instead.
  await form.getByLabel('Trello export').setInputFiles({
    name: 'board.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('not,json'),
  });
  await form.getByRole('button', { name: 'Import' }).click();
  await expect(form.getByRole('alert')).toContainText('Export as JSON');

  await form.getByLabel('Trello export').setInputFiles({
    name: 'board.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trello)),
  });
  await form.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('import-result')).toContainText(
    'Imported 2 backlog items and 3 tasks, 1 new label, 1 checklist entries',
  );
  await page.getByTestId('import-result').getByRole('link', { name: 'Open the Backlog' }).click();
  const should = page.getByTestId('lane-should');
  await expect(should.getByTestId('item-card')).toHaveText([/Combat/, /Menus/]);
  await should.getByRole('link', { name: 'Combat', exact: true }).click();
  const rows = page.getByTestId('tasks-code').getByTestId('task-row');
  await expect(rows).toHaveText([/Sword swing/, /Dodge roll/]);
  await expect(rows.first().locator('.label-chip')).toHaveText(['Bug']);
  await expect(rows.nth(1)).toContainText('1/1');

  // Both exports download, named after the project.
  await page.goto(settings);
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export the project (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toBe('gameweld-Transfer-project.json');
  const data = JSON.parse((await (await json.createReadStream()).toArray()).join(''));
  expect(data.items.map((i: { title: string }) => i.title)).toEqual(['Combat', 'Menus']);
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export the tasks (CSV)' }).click(),
  ]);
  expect(csv.suggestedFilename()).toBe('gameweld-Transfer-project-tasks.csv');

  // Neither is offered to someone who is not a Director.
  await switchPersona(page, 'developer');
  await page.goto(settings);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import and export' })).toHaveCount(0);
});
