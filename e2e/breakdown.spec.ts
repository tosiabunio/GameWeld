import { expect, test } from '@playwright/test';
import { closeTask, signIn, taskModal } from './helpers.ts';

test('a Developer breaks an item down into tasks and edits one', async ({ page }) => {
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByTestId('lane-should')
    .getByRole('link', { name: 'Boss arena', exact: true })
    .click();

  const code = page.getByTestId('tasks-code');
  const content = page.getByTestId('tasks-content');
  await code.getByLabel('New Code task').fill('Arena gate logic');
  await code.getByRole('button', { name: 'Add' }).click();
  await expect(code.getByTestId('task-row')).toHaveCount(1);
  await content.getByLabel('New Content task').fill('Dress the arena');
  await content.getByRole('button', { name: 'Add' }).click();
  await expect(content.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(0);
  await expect(code.getByTestId('task-row').first()).toContainText('Unplaced');
  await expect(page.getByText('0/2 tasks complete')).toBeVisible();

  // Open the task, dismiss the prompt, assign and describe it.
  await code.getByRole('link', { name: 'Arena gate logic' }).click();
  const task = taskModal(page);
  await task.getByRole('button', { name: 'Edit task' }).click();
  await expect(task.getByTestId('prompt-task-description')).toBeVisible();
  await task.getByRole('button', { name: 'Dismiss writing prompt' }).click();
  await expect(task.getByTestId('prompt-task-description')).toHaveCount(0);
  await task.getByLabel('Assignee').selectOption({ label: 'Devin Developer' });
  await task.getByLabel('Description').fill('Gate closes when the boss wakes up.');
  await task.getByRole('button', { name: 'Save' }).click();
  await expect(task.getByText('Saved.')).toBeVisible();
  await expect(task.getByRole('heading', { name: 'Game Director actions' })).toHaveCount(0);

  // The window closes onto the item it was opened over; the assignee shows on the task row
  // without a reload.
  await closeTask(page);
  await expect(page).toHaveURL(/\/breakdown\/[0-9a-f-]+$/);
  await expect(page.getByTestId('item-nav').getByRole('link', { name: /Boss arena/ })).toHaveClass(
    /active/,
  );
  await expect(page.getByTestId('tasks-code').getByTestId('card-assignee')).toHaveAccessibleName(
    'Assignee of Arena gate logic: Devin Developer',
  );
});

test('a placed task shows its board and column; a Director sees delete and reparent actions', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByTestId('lane-must')
    .getByRole('link', { name: 'Ranged enemy', exact: true })
    .click();
  const row = page.getByTestId('tasks-code').getByTestId('task-row').first();
  await expect(row).toContainText('On September production · To Do · Code');
  // A click anywhere on the row opens the task, not only one on its title.
  await row.locator('.card-meta').click({ position: { x: 2, y: 2 } });
  const task = taskModal(page);
  await expect(task.getByLabel('Category')).toBeDisabled();
  await expect(task.getByRole('heading', { name: 'Game Director actions' })).toBeVisible();
  await expect(task.getByRole('button', { name: 'Delete task' })).toBeVisible();
});
