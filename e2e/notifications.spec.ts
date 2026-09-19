import { expect, test } from '@playwright/test';
import { closeTask, signIn, switchPersona, taskModal } from './helpers.ts';

test('the bell tells a member what concerns them and shows a Director what waits for a decision', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Bell project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const member = page.getByRole('form', { name: 'Add member' });
  await member.getByLabel('Email').fill('developer@gameweld.local');
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Boss fight');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await must.getByRole('link', { name: 'Boss fight', exact: true }).click();
  const code = page.getByTestId('tasks-code');
  await code.getByLabel('New Code task').fill('Phase two');
  await code.getByRole('button', { name: 'Add' }).click();
  await code.getByTestId('card-assignee').click();
  await page
    .getByRole('menu', { name: 'Assign Phase two' })
    .getByRole('menuitemradio', { name: 'Devin Developer' })
    .click();
  await expect(code.getByTestId('card-assignee')).toHaveAccessibleName(
    'Assignee of Phase two: Devin Developer',
  );

  // The Developer hears that the task is theirs. Opening the notification opens the task and
  // counts it as read.
  await switchPersona(page, 'developer');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  const panel = page.getByTestId('notifications');
  const project = (name: string) => panel.getByRole('link').filter({ hasText: name });
  await bell.click();
  const assigned = project('Bell project').filter({ hasText: 'assigned' });
  await expect(assigned).toContainText('Dana Director assigned Phase two to you');
  await expect(panel.locator('li.unread').filter({ hasText: 'Bell project' })).toHaveCount(1);
  await assigned.click();
  await expect(taskModal(page).getByRole('heading', { name: 'Phase two' })).toBeVisible();
  await expect(panel).toBeHidden();
  const taskUrl = new URL(page.url()).pathname;
  await closeTask(page);
  await bell.click();
  await expect(panel.locator('li.unread').filter({ hasText: 'Bell project' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Finishing the item's only task makes the item ready for review. Tasks are finished on a
  // Workboard, which this project does not have, so the request is made directly.
  expect((await page.request.post(`/api${taskUrl}/complete`)).ok()).toBe(true);

  // The Director finds it waiting, above the notification that says the same once.
  await switchPersona(page, 'director');
  await expect(page.getByTestId('notification-count')).toBeVisible();
  await bell.click();
  const waiting = panel.getByRole('region', { name: 'Waiting for you' });
  await expect(waiting.getByRole('link').filter({ hasText: 'Bell project' })).toContainText(
    'Boss fight is ready for review',
  );
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(panel.locator('li.unread')).toHaveCount(0);
  // Read or not, it goes on waiting until someone decides; the way there is one click.
  await waiting.getByRole('link').filter({ hasText: 'Bell project' }).click();
  await expect(page.getByRole('heading', { name: 'Boss fight', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept as Done' }).click();
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();
  await expect(page.getByTestId('accepted')).toBeVisible();
  await bell.click();
  await expect(waiting.getByRole('link').filter({ hasText: 'Bell project' })).toHaveCount(0);
});
