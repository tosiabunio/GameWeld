import { expect, test } from '@playwright/test';
import { activateFromBacklog, createWorkboard, signIn, switchPersona } from './helpers.ts';

test('a Developer requests out-of-scope work and a Director approves it', async ({ page }) => {
  // Director sets up: two Must Have items, one task each, a board with the first item in scope.
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Request project');
  await page.getByLabel('Workboard scope limit').fill('1');
  await page.getByRole('button', { name: 'Create project' }).click();
  const add = page.getByRole('form', { name: 'Add member' });
  await add.getByLabel('Email').fill('developer@gameweld.local');
  await add.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  for (const title of ['Ranged enemy', 'Flying enemy']) {
    await must.getByLabel('New item in Must Have').fill(title);
    await must.getByRole('button', { name: 'Add' }).click();
    await expect(must.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }
  await must.getByRole('link', { name: 'Ranged enemy', exact: true }).click();
  await page.getByTestId('tasks-code').getByLabel('New Code task').fill('Targeting');
  await page.getByTestId('tasks-code').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-code').getByTestId('task-row')).toHaveCount(1);
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Flying enemy', exact: true })).toBeVisible();
  await page.getByTestId('tasks-assets').getByLabel('New Assets task').fill('Swoop animation');
  await page.getByTestId('tasks-assets').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const boardUrl = page.url();
  // As a Director, Flying enemy's task offers direct placement, not a request.
  await page.getByRole('link', { name: 'Breakdown' }).click();
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Flying enemy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Swoop animation to Workboard' })).toHaveText(
    'Place as exception',
  );
  const breakdownUrl = page.url();

  // Section 15 "Developer requests work on an inactive item".
  await switchPersona(page, 'developer');
  await page.goto(breakdownUrl);
  await page.getByRole('button', { name: 'Request placement of Swoop animation' }).click();
  await page.getByLabel('Reason').fill('An artist is free this week.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Placement requested')).toBeVisible();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row').first()).toContainText(
    'Unplaced',
  );
  await page.goto(boardUrl);
  await expect(page.getByTestId('board-counts')).toContainText('1 pending request');
  await expect(page.getByTestId('request')).toContainText('An artist is free this week.');
  await expect(
    page.getByRole('button', { name: 'Approve request for Swoop animation' }),
  ).toHaveCount(0);

  // Section 15 "Director approves that request": only the task enters, with the badge.
  await switchPersona(page, 'director');
  await page.goto(boardUrl);
  await page.getByRole('button', { name: 'Approve request for Swoop animation' }).click();
  await page.getByLabel('Decision note').fill('Go ahead.');
  await page.getByRole('button', { name: 'Approve and place' }).click();
  const card = page.getByTestId('item-card').filter({ hasText: 'Swoop animation' });
  await expect(card).toContainText('Out of scope');
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  await expect(page.getByTestId('board-counts')).toContainText('1 out-of-scope task');
  await expect(page.getByTestId('board-counts')).not.toContainText('pending request');
});

test('a Developer asks for out-of-scope work from the Workboard, for a new task or a waiting one', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Board request project');
  await page.getByLabel('Workboard scope limit').fill('1');
  await page.getByRole('button', { name: 'Create project' }).click();
  const add = page.getByRole('form', { name: 'Add member' });
  await add.getByLabel('Email').fill('developer@gameweld.local');
  await add.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  for (const title of ['Ranged enemy', 'Flying enemy']) {
    await must.getByLabel('New item in Must Have').fill(title);
    await must.getByRole('button', { name: 'Add' }).click();
    await expect(must.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }
  await must.getByRole('link', { name: 'Flying enemy', exact: true }).click();
  await page.getByTestId('tasks-assets').getByLabel('New Assets task').fill('Swoop animation');
  await page.getByTestId('tasks-assets').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  const boardUrl = page.url();

  // A Director places outside work directly, so the panel offers them nothing to ask for.
  const panel = page.getByTestId('requests');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '+ Request out-of-scope work' })).toHaveCount(0);

  // A Developer asks for work nobody has written down yet: the task is created with the request.
  await switchPersona(page, 'developer');
  await page.goto(boardUrl);
  await panel.getByRole('button', { name: '+ Request out-of-scope work' }).click();
  const form = page.getByRole('form', { name: 'Request out-of-scope work' });
  await expect(form.getByRole('button', { name: 'Send request' })).toBeDisabled();
  // Only items outside the scope are offered.
  await expect(form.getByLabel('Backlog item').locator('option')).toHaveText([
    'Choose an item outside the scope…',
    'Flying enemy (Must Have)',
  ]);
  await form.getByLabel('Backlog item').selectOption({ label: 'Flying enemy (Must Have)' });
  await expect(
    form.getByRole('combobox', { name: 'Task', exact: true }).locator('option'),
  ).toHaveText(['New task…', 'Swoop animation (Assets)']);
  await form.getByLabel('New task’s title').fill('Dive attack');
  await form.getByLabel('Category').selectOption({ label: 'Code' });
  await form.getByLabel('Why now? (optional)').fill('Blocks the boss fight.');
  await form.getByRole('button', { name: 'Send request' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('request')).toContainText('Dive attack');
  await expect(page.getByTestId('request')).toContainText('Blocks the boss fight.');
  await expect(page.getByTestId('board-counts')).toContainText('1 pending request');
  await expect(page.getByTestId('item-card').filter({ hasText: 'Dive attack' })).toHaveCount(0);

  // A task that already waits in the Breakdown is asked for by name.
  await panel.getByRole('button', { name: '+ Request out-of-scope work' }).click();
  await form.getByLabel('Backlog item').selectOption({ label: 'Flying enemy (Must Have)' });
  // Dive attack is already asked for, so it is not offered again.
  await expect(
    form.getByRole('combobox', { name: 'Task', exact: true }).locator('option'),
  ).toHaveText(['New task…', 'Swoop animation (Assets)']);
  await form
    .getByRole('combobox', { name: 'Task', exact: true })
    .selectOption({ label: 'Swoop animation (Assets)' });
  await expect(form.getByLabel('New task’s title')).toHaveCount(0);
  await form.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByTestId('request')).toHaveCount(2);
  await expect(page.getByTestId('board-counts')).toContainText('2 pending requests');

  // The Director approves the new task's request; it enters the board as out-of-scope work.
  await switchPersona(page, 'director');
  await page.goto(boardUrl);
  await page.getByRole('button', { name: 'Approve request for Dive attack' }).click();
  await page.getByRole('button', { name: 'Approve and place' }).click();
  await expect(page.getByTestId('item-card').filter({ hasText: 'Dive attack' })).toContainText(
    'Out of scope',
  );
});
