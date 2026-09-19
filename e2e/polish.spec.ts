import { expect, test } from '@playwright/test';

// A browser that asks for Polish gets the interface in Polish, without being told to.
test.use({ locale: 'pl-PL' });

test('the interface is in Polish for a Polish browser, and English again on request', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByTestId('persona-director').click();
  await expect(page.getByTestId('current-user')).toBeVisible();
  await page.getByRole('link', { name: 'Demo project' }).click();

  // The sections carry their Polish names; the project's own data stays as it was written.
  const tabs = page.getByRole('navigation').getByRole('link');
  await expect(tabs.filter({ hasText: 'Podział' })).toBeVisible();
  await expect(tabs.filter({ hasText: 'Tablica' })).toBeVisible();
  await expect(page.getByTestId('lane-must')).toContainText('Must Have');
  await expect(page.getByTestId('lane-must')).toContainText('Ranged enemy');
  // "0 of 3 tasks" takes the genitive in Polish, as the fraction reads aloud.
  await expect(page.getByTestId('lane-must').getByTestId('item-card').first()).toContainText(
    '0/3 zadań',
  );
  // No English is left in the places everyone sees first.
  await expect(page.getByTestId('backlog')).not.toContainText('No tasks yet');
  await expect(page.getByTestId('backlog')).not.toContainText('No cards yet');

  await tabs.filter({ hasText: 'Tablica' }).click();
  await expect(page.getByTestId('board-counts')).toContainText('w zakresie');
  await page
    .getByTestId('item-card')
    .first()
    .click({ position: { x: 6, y: 6 } });
  const task = page.getByTestId('task-modal');
  await expect(task).toContainText('Lista kontrolna');
  await expect(task).toContainText('Komentarze');
  await expect(task).not.toContainText('Checklist');
  await page.keyboard.press('Escape');

  // The profile page changes the language; the choice is kept and the page reloads in it.
  await page.goto('/profile');
  await page.getByRole('combobox', { name: 'Język' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  await page.goto('/');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Breakdown' })).toBeVisible();
});
