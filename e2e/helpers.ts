import { expect, type Page } from '@playwright/test';

/**
 * The picker signs in through a background request, so every path into a session waits for the
 * signed-in shell before the test navigates. Going straight to a URL after the click races the
 * request that sets the session cookie and lands on the picker again.
 */
async function pickPersona(page: Page, persona: string) {
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

export async function signIn(page: Page, persona: string) {
  await page.goto('/');
  await pickPersona(page, persona);
}

export async function switchPersona(page: Page, persona: string) {
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await pickPersona(page, persona);
}

export async function activateFromBacklog(page: Page, title: string) {
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Backlog' })
    .click();
  const card = page.getByTestId('item-card').filter({ hasText: title });
  await card.getByRole('button', { name: `Add ${title} to Workboard` }).click();
  await card
    .getByRole('group', { name: `Activate ${title}` })
    .getByRole('button', { name: 'Activate' })
    .click();
  await expect(card).toContainText('On ');
  await page.getByRole('link', { name: 'Workboard' }).click();
}
