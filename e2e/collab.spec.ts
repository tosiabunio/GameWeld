import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('attachments, comments, dependencies, and history on items and tasks', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page.getByTestId('lane-should').getByRole('link', { name: 'Boss arena' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Boss arena');

  // Upload a small PNG to the item and use it as the cover.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('Add attachment')
    .setInputFiles({ name: 'arena.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('attachment')).toContainText('arena.png');
  await page.getByRole('button', { name: 'Use as cover' }).click();
  await expect(page.getByTestId('attachment')).toContainText('cover');
  // The download is served by the API with membership checks.
  const href = await page
    .getByTestId('attachment')
    .locator('a', { hasText: 'arena.png' })
    .evaluate((a) => (a as HTMLAnchorElement).href);
  const download = await page.request.get(href);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-disposition']).toContain('attachment');

  // Dependency on another item, shown with its state.
  await page
    .getByLabel('Item this one depends on')
    .selectOption({ label: 'Ranged enemy (Must Have)' });
  await page
    .getByRole('form', { name: 'Add dependency' })
    .getByRole('button', { name: 'Add' })
    .click();
  await expect(page.getByTestId('depends-on')).toContainText('Ranged enemy');
  await expect(page.getByTestId('depends-on')).toContainText('Open');

  // History lists what just happened.
  await page.getByRole('button', { name: /History/ }).click();
  await expect(page.getByTestId('history-entry').first()).toContainText('Dana Director');
  await expect(page.getByTestId('history')).toContainText('added a dependency');
  await expect(page.getByTestId('history')).toContainText('added an attachment');

  // Back on the Backlog the cover shows on the card.
  await page.getByRole('link', { name: 'Backlog' }).click();
  await expect(
    page
      .getByTestId('lane-should')
      .getByTestId('item-card')
      .filter({ hasText: 'Boss arena' })
      .locator('img.cover'),
  ).toBeVisible();

  // Task comments: add, edit, delete.
  await page.getByTestId('lane-must').getByRole('link', { name: 'Ranged enemy' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Ranged enemy');
  await page.getByTestId('tasks-code').getByRole('link', { name: 'Targeting' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Targeting');
  const add = page.getByRole('form', { name: 'Add comment' });
  await add.getByLabel('Comment').fill('Lock-on feels sticky.');
  await add.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByTestId('comments')).toContainText('Lock-on feels sticky.');
  await page.getByRole('button', { name: 'Edit comment' }).click();
  await page.getByLabel('Comment text').fill('Lock-on feels sticky at range.');
  await page
    .getByRole('form', { name: 'Edit comment' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByTestId('comments')).toContainText('Lock-on feels sticky at range.');
  await expect(page.getByTestId('comments')).toContainText('edited');
  await page.getByRole('button', { name: 'Delete comment' }).click();
  await expect(page.getByTestId('comments-block')).toContainText('No comments yet.');
});
