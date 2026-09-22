import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('the method is open to anyone, from the sign-in page and from the top bar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'How GameWeld works: the method' }).click();
  await expect(page).toHaveURL(/\/method$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The GameWeld Method' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '5. Code, Assets, and Content' })).toBeVisible();
  // Nothing on it scrolls the page sideways on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Method', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The GameWeld Method' })).toBeVisible();
  await page.getByRole('link', { name: 'GameWeld' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
});

test('the method reads in Polish for a Polish viewer, and switches language', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gameweld:lang', 'pl'));
  await page.goto('/method');
  await expect(page.getByRole('heading', { level: 1, name: 'Metoda GameWeld' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '5. Kod, Assety i Treść' })).toBeVisible();
  await expect(page).toHaveTitle('Metoda GameWeld');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The GameWeld Method' })).toBeVisible();
});
