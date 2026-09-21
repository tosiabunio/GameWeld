import { expect, test, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { signIn } from './helpers.ts';

/** Red on the left half, blue on the right, so the chosen circle is visible in the result. */
async function halves(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set(x < width / 2 ? [255, 0, 0] : [0, 0, 255], (y * width + x) * 3);
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/** The colour at the centre of a loaded picture. */
const colourOf = (img: Locator) =>
  img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [el.naturalWidth, el.naturalHeight];
    const context = canvas.getContext('2d')!;
    context.drawImage(el, 0, 0);
    const [r, , b] = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return r! > 200 && b! < 60 ? 'red' : b! > 200 && r! < 60 ? 'blue' : 'other';
  });

test('a user uploads a picture, chooses its circle, and is shown by it', async ({ page }) => {
  await signIn(page, 'tester');
  await page.getByTestId('current-user').click();
  const profile = page.getByRole('dialog', { name: 'Your profile' });
  await expect(profile).toBeVisible();
  const me = page.locator('.topbar .me .avatar');
  await expect(me).toHaveText('TT');

  // A wide picture opens in the cropper; the arrow keys move the circle to its left edge.
  await page
    .getByLabel('Upload a picture')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await halves(800, 400) });
  const stage = page.getByRole('group', { name: /Choose the part of the picture/ });
  await expect(stage).toBeVisible();
  await stage.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  // Full zoom narrows the circle to a small part of the picture, still at its left edge.
  await page.getByRole('slider', { name: 'Zoom' }).fill('1000');
  await stage.focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Save picture' }).click();
  await expect(page.getByRole('status')).toHaveText('Picture saved.');
  const saved = await (await page.request.get('/api/me/avatar')).json();
  expect(saved.crop.left).toBe(0);
  expect(saved.crop.size).toBeLessThan(0.1);
  const picture = me.locator('img');
  await expect(picture).toHaveAttribute('src', /^\/api\/users\/[0-9a-f-]+\/avatar\/[0-9a-f-]+$/);
  expect(await colourOf(picture)).toBe('red');
  const first = await picture.getAttribute('src');

  // Choosing again starts from the saved circle, zoomed in as it was saved.
  await page.getByRole('button', { name: 'Change the circle' }).click();
  await expect(stage).toBeVisible();
  const zoom = page.getByRole('slider', { name: 'Zoom' });
  await expect(zoom).toHaveValue('1000');
  // Zoomed out, dragging the picture to the left brings its right half into the circle.
  await zoom.fill('0');
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 300, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Save picture' }).click();
  await expect(page.getByRole('status')).toHaveText('Picture saved.');
  await expect(picture).not.toHaveAttribute('src', first!);
  expect(await colourOf(picture)).toBe('blue');

  // Others see it wherever they pick an assignee.
  await profile.getByRole('button', { name: 'Close profile' }).click();
  await expect(profile).toHaveCount(0);
  await page.getByRole('link', { name: 'GameWeld' }).click();
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Workboard' })
    .click();
  await page.getByTestId('card-assignee').first().click();
  const choice = page.getByRole('menuitemradio', { name: 'Tess Tester' });
  await expect(choice.locator('img')).toHaveAttribute('src', (await picture.getAttribute('src'))!);
  await page.keyboard.press('Escape');

  // Removing it brings the initials back. The profile opens over the Workboard, and closing it
  // leaves the viewer there.
  const board = page.url();
  await page.getByTestId('current-user').click();
  await profile.getByRole('button', { name: 'Remove picture' }).click();
  await expect(profile.getByRole('status')).toContainText('Picture removed');
  await expect(me).toHaveText('TT');
  await expect(profile.getByRole('button', { name: 'Change the circle' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(profile).toHaveCount(0);
  expect(page.url()).toBe(board);
  await expect(page.getByTestId('card-assignee').first()).toBeVisible();
});
