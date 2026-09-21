import { expect, test } from '@playwright/test';

test('a persona can sign in and sees the demo project', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in as' })).toBeVisible();

  await page.getByTestId('persona-director').click();
  await expect(page.getByTestId('current-user')).toHaveText('Dana Director');

  const card = page.getByTestId('project-card').first();
  await expect(card).toContainText('Demo project');
  await expect(card).toContainText('Your roles: Game Director');
});

test('switching persona returns to the picker and signs in as someone else', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('persona-developer').click();
  await expect(page.getByTestId('current-user')).toHaveText('Devin Developer');

  // From inside a project: the next persona starts from the projects list, not that project.
  await page.getByRole('link', { name: 'Demo project' }).click();
  await expect(page).toHaveURL(/\/projects\//);
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('persona-tester').click();
  await expect(page.getByTestId('current-user')).toHaveText('Tess Tester');
  await expect(page.getByTestId('project-card').first()).toContainText('Your roles: Tester');
});

test('a refused provider sign-in explains why, once', async ({ page }) => {
  await page.goto('/?auth_error=not_invited&email=someone%40example.com');
  await expect(page.getByRole('alert')).toContainText('someone@example.com has not been invited');
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in as' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
