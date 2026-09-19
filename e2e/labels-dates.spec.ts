import { expect, test } from '@playwright/test';
import {
  activateFromBacklog,
  closeTask,
  createWorkboard,
  signIn,
  switchPersona,
  taskModal,
} from './helpers.ts';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a card carries labels, a date, and a blocked flag; the Workboard has an end date', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Labels project');
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
  for (const [i, title] of ['Phase one', 'Phase two'].entries()) {
    await code.getByLabel('New Code task').fill(title);
    await code.getByRole('button', { name: 'Add' }).click();
    await expect(code.getByTestId('task-row')).toHaveCount(i + 1);
  }
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Boss fight');
  const board = page.url();

  // A Developer labels a task, making the label on the way; it goes onto the task at once.
  await switchPersona(page, 'developer');
  await page.goto(board);
  const card = page.getByTestId('item-card').filter({ hasText: 'Phase two' });
  await card.click({ position: { x: 6, y: 6 } });
  const task = taskModal(page);
  await task.getByRole('button', { name: 'Labels', exact: true }).click();
  const labels = page.getByRole('group', { name: 'Labels', exact: true });
  await expect(labels).toContainText('No labels in this project yet.');
  await labels.getByLabel('New label name').fill('Bug');
  await labels.getByRole('radio', { name: 'red' }).click();
  await labels.getByRole('button', { name: 'Add label' }).click();
  await expect(labels.getByRole('checkbox', { name: 'Bug' })).toBeChecked();
  // Renaming and deleting are a Director's.
  await expect(labels.getByRole('button', { name: 'Edit label Bug' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(task.locator('.label-field > .label-chip')).toHaveText(['Bug']);

  // A date in the past reads as overdue; the block carries its reason.
  await task.getByLabel('Due date').fill(day(-1));
  await expect(task.locator('.due-date')).toHaveClass(/overdue/);
  await task.getByRole('button', { name: 'Flag as blocked…' }).click();
  await task.getByLabel('Why the task is blocked').fill('Waiting for the rig');
  await task.getByLabel('Why the task is blocked').press('Enter');
  await expect(task.locator('.blocked-field')).toContainText('Waiting for the rig');
  // Flagging did not submit or close anything around it.
  await expect(task.getByRole('heading', { name: 'Phase two' })).toBeVisible();
  await closeTask(page);

  // The card says all three.
  await expect(card.locator('.label-chip')).toHaveText(['Bug']);
  await expect(card.locator('.label-chip')).toHaveClass(/label-red/);
  await expect(card.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(card.locator('.due-date')).toHaveClass(/overdue/);

  // The Workboard filters by them.
  const cards = page.getByTestId('workboard').getByTestId('item-card');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Filters', exact: true });
  await menu.getByLabel('Blocked only').check();
  await expect(cards).toHaveText([/Phase two/]);
  await menu.getByLabel('Blocked only').uncheck();
  await menu.getByLabel('Label').selectOption({ label: 'Bug' });
  await expect(cards).toHaveText([/Phase two/]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(cards).toHaveCount(2);

  // The Directors heard about the block. A Director recolours the label and sets the board's end.
  await switchPersona(page, 'director');
  await page.goto(board);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(
    page
      .getByTestId('notifications')
      .getByRole('link')
      .filter({ hasText: 'Labels project' })
      .first(),
  ).toContainText('Devin Developer flagged Phase two as blocked');
  await page.keyboard.press('Escape');

  await card.click({ position: { x: 6, y: 6 } });
  await task.getByRole('button', { name: 'Labels', exact: true }).click();
  await labels.getByRole('button', { name: 'Edit label Bug' }).click();
  await labels.getByLabel('Label name', { exact: true }).fill('Defect');
  await labels.locator('.label-edit').getByRole('radio', { name: 'purple' }).click();
  await labels.getByRole('button', { name: 'Save' }).click();
  await expect(labels.getByRole('checkbox', { name: 'Defect' })).toBeChecked();
  await page.keyboard.press('Escape');
  // Finishing the task lifts the block.
  await task.getByRole('button', { name: 'Mark complete' }).click();
  await expect(task.locator('.blocked-field')).toContainText('No');
  await closeTask(page);
  await expect(card.locator('.label-chip')).toHaveText(['Defect']);
  await expect(card.locator('.label-chip')).toHaveClass(/label-purple/);
  await expect(card.getByText('Blocked', { exact: true })).toHaveCount(0);
  await expect(card.locator('.due-date')).not.toHaveClass(/overdue/);

  const end = page.getByTestId('board-end');
  await expect(end).toHaveText('Set an end date');
  await end.click();
  await page.getByLabel('The Workboard ends on').fill(day(10));
  await page.keyboard.press('Escape');
  await expect(end).toContainText('10 days left');
  // Someone who does not manage the board sees the date, not a control.
  await switchPersona(page, 'developer');
  await page.goto(board);
  await expect(page.getByTestId('board-end')).toContainText('10 days left');
  await expect(page.getByRole('button', { name: /10 days left/ })).toHaveCount(0);
});
