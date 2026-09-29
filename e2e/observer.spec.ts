import { expect, test } from '@playwright/test';
import { signIn, switchPersona } from './helpers.ts';

test('an Observer reads the Backlog, the Workboard, and the Overview, and changes nothing', async ({
  page,
}) => {
  await signIn(page, 'observer');
  await expect(page.getByTestId('admin-link')).toHaveCount(0);
  await page.getByRole('link', { name: 'Demo project' }).click();

  const tabs = page.getByRole('navigation', { name: 'Project sections' });
  await expect(tabs.getByRole('link')).toHaveText(['Backlog', 'Workboard', 'Overview']);
  await expect(page.getByRole('link', { name: 'Project settings' })).toHaveCount(0);
  await expect(page.getByTestId('item-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /to Workboard$/ })).toHaveCount(0);

  await tabs.getByRole('link', { name: 'Workboard' }).click();
  await expect(page.getByTestId('workboard')).toBeVisible();
  await expect(page.getByTestId('history')).toHaveCount(0);

  // The pages that are not an Observer's lead back to the Backlog.
  await page.goto(page.url().replace(/\/board.*$/, '/settings'));
  await expect(page).toHaveURL(/\/backlog$/);
});

test('others still see the Workboard’s history', async ({ page }) => {
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Workboard' })
    .click();
  await expect(page.getByTestId('history')).toBeVisible();
  await switchPersona(page, 'observer');
  await expect(page.getByTestId('current-user')).toHaveText('Olivia Observer');
});
