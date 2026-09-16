import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, persona: string) {
  await page.goto('/');
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

test('a Director creates a project, changes settings, and manages members', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Browser project');
  await page.getByLabel('Description').fill('Created in a browser test');
  await page.getByLabel('Workboard scope limit').fill('4');
  await page.getByRole('button', { name: 'Create project' }).click();

  // Lands on settings as the only member and Director.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('members-table')).toContainText('Dana Director');

  // Section 15 "Done restriction is enabled": toggle and save.
  await page.getByTestId('done-restricted').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await expect(page.getByTestId('done-restricted')).toBeChecked();

  // Add a member with two roles.
  const add = page.getByRole('form', { name: 'Add member' });
  await add.getByLabel('Email').fill('tester@gameweld.local');
  await add.getByLabel('Tester', { exact: true }).check();
  await add.getByRole('button', { name: 'Add member' }).click();
  const tester = page.getByTestId('member-tester@gameweld.local');
  await expect(tester).toBeVisible();
  await expect(tester.getByLabel('Tess Tester is Developer')).toBeChecked();
  await expect(tester.getByLabel('Tess Tester is Tester')).toBeChecked();

  // A member keeps at least one role, and the last Director cannot step down.
  const director = page.getByTestId('member-director@gameweld.local');
  await director.getByLabel('Dana Director is Game Director').click();
  await expect(page.getByText('A member needs at least one role.')).toBeVisible();
  await director.getByLabel('Dana Director is Developer').click();
  await expect(director.getByLabel('Dana Director is Developer')).toBeChecked();
  await director.getByLabel('Dana Director is Game Director').click();
  await expect(page.getByText('A project needs at least one Game Director.')).toBeVisible();
  await expect(director.getByLabel('Dana Director is Game Director')).toBeChecked();

  // Back on the list the project shows the restriction.
  await page.getByRole('link', { name: 'GameWeld' }).click();
  const card = page.getByTestId('project-card').filter({ hasText: 'Browser project' });
  await expect(card).toContainText('Done restricted to Testers');
  await expect(card).toContainText('scope limit 4');
});

test('a non-Director sees settings read-only and cannot manage members', async ({ page }) => {
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Only a Game Director can change settings.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Add member' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByTestId('done-restricted')).toBeDisabled();
});

test('a project the user does not belong to is not visible', async ({ page }) => {
  await signIn(page, 'tester');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Tester private');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const url = page.url();

  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByTestId('persona-developer').click();
  await page.goto(url);
  await expect(page.getByText('Project not found, or you are not a member.')).toBeVisible();
});
