import { expect, test } from '@playwright/test';
import { dropFile, signIn, TINY_PNG } from './helpers.ts';

test('display options collapse empty columns and shrink covers, for this viewer only', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Display options');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Title screen');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  const card = must.getByTestId('item-card').filter({ hasText: 'Title screen' });
  await dropFile(page, card, { name: 'title.png', type: 'image/png', base64: TINY_PNG });
  const cover = card.locator('img.cover');
  await expect(cover).toBeVisible();
  const banner = (await cover.boundingBox())!;
  expect(banner.width).toBeGreaterThan(200);

  // Off by default: every lane is open, empty or not.
  await expect(page.locator('.lane.collapsed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Display options' }).click();
  await page.getByLabel('Collapse empty columns').check();
  await page.getByLabel('Small cover images').check();
  await page.keyboard.press('Escape');

  // The five empty lanes fold; the one with a card stays open, and its cover is a thumbnail.
  await expect(page.locator('.lane.collapsed')).toHaveCount(5);
  await expect(must).not.toHaveClass(/collapsed/);
  const thumb = (await cover.boundingBox())!;
  expect(thumb.width).toBeLessThan(60);
  expect(Math.abs(thumb.width - thumb.height)).toBeLessThan(2);
  // It stands at the card's right edge, past the title.
  const title = (await card
    .getByRole('link', { name: 'Title screen', exact: true })
    .boundingBox())!;
  const frame = (await card.boundingBox())!;
  expect(thumb.x).toBeGreaterThan(title.x + title.width);
  expect(frame.x + frame.width - (thumb.x + thumb.width)).toBeLessThan(16);

  // A folded empty lane opens on request, takes a card, and then stays open by itself.
  await page.getByRole('button', { name: /^Expand Should Have/ }).click();
  const should = page.getByTestId('lane-should');
  await should.getByLabel('New item in Should Have').fill('Credits');
  await should.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(should.getByTestId('item-card')).toHaveCount(1);
  await expect(page.locator('.lane.collapsed')).toHaveCount(4);

  // Both options survive a reload, and follow the viewer to the Workboard's columns.
  await page.reload();
  await expect(page.locator('.lane.collapsed')).toHaveCount(4);
  expect((await cover.boundingBox())!.width).toBeLessThan(60);
  await page.getByRole('button', { name: 'Display options' }).click();
  await expect(page.getByLabel('Small cover images')).toBeChecked();
  await page.getByLabel('Collapse empty columns').uncheck();
  await page.getByLabel('Small cover images').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lane.collapsed')).toHaveCount(0);
  expect((await cover.boundingBox())!.width).toBeGreaterThan(200);
});
