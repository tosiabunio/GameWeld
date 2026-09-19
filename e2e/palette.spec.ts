import { expect, test } from '@playwright/test';
import { signIn, taskModal } from './helpers.ts';

test('quick open finds tasks, items, sections, and projects from the keyboard', async ({
  page,
}) => {
  await signIn(page, 'developer');
  const palette = page.getByRole('dialog', { name: 'Quick open' });
  const field = palette.getByRole('searchbox', { name: 'Quick open' });
  const results = palette.getByRole('option');

  // Outside a project it offers the projects.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(field).toBeFocused();
  await field.fill('demo');
  await expect(results).toHaveText([/Demo project/]);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/backlog$/);
  await expect(palette).toHaveCount(0);

  // Inside one, a few letters of a title find the task, and it opens over the page in view.
  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('TARGET');
  await expect(results.first()).toContainText('Targeting');
  await expect(results.first()).toContainText('Ranged enemy');
  await page.keyboard.press('Enter');
  await expect(taskModal(page).getByRole('heading', { name: 'Targeting' })).toBeVisible();
  await expect(page.getByTestId('backlog')).toBeVisible();
  await taskModal(page).getByRole('button', { name: 'Close task' }).click();
  await expect(page).toHaveURL(/\/backlog$/);

  // An item goes to its Breakdown; a section is reached by its name; arrows choose.
  await page.getByRole('button', { name: /^Quick open/ }).click();
  await field.fill('enemy');
  await expect(palette.getByText('Backlog items')).toBeVisible();
  await results.filter({ hasText: 'Flying enemy' }).click();
  await expect(page.getByRole('heading', { name: 'Flying enemy', exact: true })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('b');
  // "Backlog", "Breakdown", "Workboard" all have a b; the third is two steps down.
  await expect(results.filter({ hasText: 'Workboard' })).toBeVisible();
  const at = await results.allTextContents();
  for (let i = 0; i < at.findIndex((t) => t.includes('Workboard')); i++)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/board$/);

  // What matches nothing says so, and Escape puts the palette away.
  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('zzzz-nothing');
  await expect(palette).toContainText('Nothing found.');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});
