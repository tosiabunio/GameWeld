import { expect, type Locator, type Page } from '@playwright/test';

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

/** A 1×1 PNG, small enough to inline. */
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Drops a file on a target the way a drag from the desktop does: a native drop with a DataTransfer. */
export async function dropFile(
  page: Page,
  target: Locator,
  file: { name: string; type: string; base64: string },
) {
  const dataTransfer = await page.evaluateHandle(({ name, type, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    return dt;
  }, file);
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

/** A cover fills its card's width in one 16:9 frame, whatever the image's own shape. */
export async function expectCoverFrame(card: Locator) {
  const cover = card.locator('img.cover');
  await expect(cover).toBeVisible();
  const [coverBox, cardBox] = [await cover.boundingBox(), await card.boundingBox()];
  expect(Math.abs(coverBox!.width - cardBox!.width)).toBeLessThanOrEqual(2);
  expect(coverBox!.width / coverBox!.height).toBeCloseTo(16 / 9, 1);
}
