import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, persona: string) {
  await page.goto('/');
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

test('a Developer breaks an item down into tasks and edits one', async ({ page }) => {
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page.getByTestId('lane-should').getByRole('link', { name: 'Boss arena' }).click();

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
  await expect(page.getByTestId('prompt-task-description')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss writing prompt' }).click();
  await expect(page.getByTestId('prompt-task-description')).toHaveCount(0);
  await page.getByLabel('Assignee').selectOption({ label: 'Devin Developer' });
  await page.getByLabel('Description').fill('Gate closes when the boss wakes up.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game Director actions' })).toHaveCount(0);

  // Back on the item, the assignee shows on the task row and the prompt stays dismissed.
  await page.getByRole('link', { name: '← Boss arena' }).click();
  await expect(page.getByTestId('tasks-code').getByTestId('task-row').first()).toContainText(
    'Devin Developer',
  );
});

test('a placed task shows its board and column; a Director sees archive and reparent actions', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page.getByTestId('lane-must').getByRole('link', { name: 'Ranged enemy' }).click();
  const row = page.getByTestId('tasks-code').getByTestId('task-row').first();
  await expect(row).toContainText('On September production · To Do · Code');
  await row.getByRole('link', { name: 'Targeting' }).click();
  await expect(page.getByLabel('Category')).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Game Director actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive task' })).toBeVisible();
});
