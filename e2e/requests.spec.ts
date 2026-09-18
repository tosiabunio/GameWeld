import { expect, test } from '@playwright/test';
import { activateFromBacklog, signIn, switchPersona } from './helpers.ts';

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
  await must.getByRole('link', { name: 'Ranged enemy' }).click();
  await page.getByTestId('tasks-code').getByLabel('New Code task').fill('Targeting');
  await page.getByTestId('tasks-code').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-code').getByTestId('task-row')).toHaveCount(1);
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  await expect(page.getByLabel('Title')).toHaveValue('Flying enemy');
  await page.getByTestId('tasks-assets').getByLabel('New Assets task').fill('Swoop animation');
  await page.getByTestId('tasks-assets').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Workboard' }).click();
  await page.getByRole('form', { name: 'Create Workboard' }).getByLabel('Name').fill('Sprint 1');
  await page.getByRole('button', { name: 'Create Workboard' }).click();
  await activateFromBacklog(page, 'Ranged enemy');
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const boardUrl = page.url();
  // As a Director, Flying enemy's task offers direct placement, not a request.
  await page.getByRole('link', { name: 'Breakdown' }).click();
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  await expect(page.getByLabel('Title')).toHaveValue('Flying enemy');
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
