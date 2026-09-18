import { expect, test } from '@playwright/test';
import { activateFromBacklog, createWorkboard, signIn } from './helpers.ts';

test('finish all tasks, accept the item, then reopen it by adding a task', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Acceptance project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Ranged enemy');
  await must.getByRole('button', { name: 'Add' }).click();
  await must.getByRole('link', { name: 'Ranged enemy', exact: true }).click();
  await page.getByTestId('tasks-code').getByLabel('New Code task').fill('Targeting');
  await page.getByTestId('tasks-code').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-code').getByTestId('task-row')).toHaveCount(1);

  // Put it on a board and drag the task into Done (Section 15 "All tasks of an item finish").
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  const card = page.getByTestId('item-card').filter({ hasText: 'Targeting' });
  const done = page.getByRole('region', { name: 'Done' });
  const from = (await card.boundingBox())!;
  const to = (await done.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(done.getByTestId('item-card').filter({ hasText: 'Targeting' })).toBeVisible();
  await expect(page.getByTestId('scope-item').first()).toContainText('Ready for Review');

  // Reject first, with a visible comment; the item stays Ready for Review.
  await page
    .getByTestId('scope-item')
    .getByRole('button', { name: /Ranged enemy/ })
    .click();
  await page.getByTestId('scope-details').getByRole('link', { name: 'Open in Breakdown' }).click();
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByLabel('What needs to change').fill('Timing feels off.');
  await page.getByRole('button', { name: 'Record rejection' }).click();
  await expect(page.getByTestId('comments')).toContainText('Timing feels off.');
  await expect(page.getByTestId('review').getByText('Every task is complete')).toBeVisible();

  // Section 15 "Director accepts the item".
  await page.getByRole('button', { name: 'Accept as Done' }).click();
  await page.getByLabel('Note (optional)').fill('Plays well now.');
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();
  await expect(page.getByTestId('accepted')).toContainText('Accepted by Dana Director');
  await expect(page.getByTestId('reopen-warning')).toContainText('This item is accepted');
  await page.getByRole('link', { name: 'Backlog' }).click();
  await expect(page.getByTestId('lane-done').getByTestId('item-card')).toContainText('Accepted');

  // Section 15 "An unfinished task is added to a Done item".
  await page
    .getByTestId('lane-done')
    .getByRole('link', { name: 'Ranged enemy', exact: true })
    .click();
  await page.getByTestId('tasks-content').getByLabel('New Content task').fill('Timing adjustment');
  await page.getByTestId('tasks-content').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-content').getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('accepted')).toHaveCount(0);
  await page.getByText('Acceptance history').click();
  await expect(page.getByText('superseded', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Backlog' }).click();
  await expect(page.getByTestId('lane-must').getByTestId('item-card')).toContainText(
    'Ranged enemy',
  );
});
