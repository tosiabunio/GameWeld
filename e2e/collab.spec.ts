import { expect, test } from '@playwright/test';
import { openResource, signIn } from './helpers.ts';

test('attachments, comments, dependencies, and history on items and tasks', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByTestId('lane-should')
    .getByRole('link', { name: 'Boss arena', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Boss arena', exact: true })).toBeVisible();

  await openResource(page, 'Attachments');
  // Upload a small PNG to the item; the newest image becomes the cover.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('Add attachment')
    .setInputFiles({ name: 'arena.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('attachment')).toContainText('arena.png');
  await expect(page.getByTestId('attachment')).toContainText('cover');
  await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();
  // The download is served by the API with membership checks.
  const href = await page
    .getByTestId('attachment')
    .locator('a', { hasText: 'arena.png' })
    .evaluate((a) => (a as HTMLAnchorElement).href);
  const download = await page.request.get(href);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-disposition']).toContain('attachment');

  await openResource(page, 'Dependencies');
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
  await page
    .getByTestId('lane-must')
    .getByRole('link', { name: 'Ranged enemy', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Ranged enemy', exact: true })).toBeVisible();
  await page.getByTestId('tasks-code').getByRole('link', { name: 'Targeting' }).click();
  await expect(page.getByRole('heading', { name: 'Targeting', exact: true })).toBeVisible();
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
