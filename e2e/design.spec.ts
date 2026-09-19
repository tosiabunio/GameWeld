import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('production views use the window width and only collapse columns on request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Design review layout');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  const lanes = page.locator('.lanes > .lane');
  await expect(lanes).toHaveCount(6);
  await expect(page.locator('.lane.collapsed')).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('.tabs')!.getBoundingClientRect();
    const main = document.querySelector('main')!.getBoundingClientRect();
    const tops = [...document.querySelectorAll('.lanes > .lane')].map(
      (lane) => lane.getBoundingClientRect().top,
    );
    return { center: nav.x + nav.width / 2, width: main.width, rows: new Set(tops).size };
  });
  expect(layout.center).toBeCloseTo(960, 0);
  expect(layout.width).toBe(1920);
  expect(layout.rows).toBe(1);

  // Lanes, and so their cards, keep to a range of widths: on a very wide window they stop
  // growing, stay on the left, and leave the rest of the row empty.
  const laneWidths = () =>
    lanes.evaluateAll((all) => all.map((lane) => lane.getBoundingClientRect().width));
  for (const width of await laneWidths()) expect(width).toBeGreaterThan(248);
  await page.setViewportSize({ width: 2800, height: 1080 });
  for (const width of await laneWidths()) expect(width).toBeCloseTo(340, 0);
  const lastLane = (await lanes.last().boundingBox())!;
  expect(lastLane.x + lastLane.width).toBeLessThan(2200);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Flight behavior');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await must.getByRole('link', { name: 'Flight behavior', exact: true }).click();
  // The backlog list is a column on the left of the item, not a strip above it.
  const [list, item] = [
    (await page.getByTestId('item-nav').boundingBox())!,
    (await page.locator('.breakdown-main').boundingBox())!,
  ];
  expect(list.x + list.width).toBeLessThanOrEqual(item.x);
  expect(Math.abs(list.y - item.y)).toBeLessThan(4);
  const code = page.getByTestId('tasks-code');
  await code.getByLabel('New Code task').fill('Steering');
  await code.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(code.getByTestId('task-row')).toHaveCount(1);
  const groups = page.locator('.task-group');
  expect(
    await groups.evaluateAll(
      (elements) => new Set(elements.map((element) => element.getBoundingClientRect().top)).size,
    ),
  ).toBe(1);
  expect((await groups.first().boundingBox())!.y).toBeLessThan(500);
  await expect(page.locator('.task-group.collapsed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse Assets tasks', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand Assets tasks', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand Assets tasks', exact: true }).click();
  const avatar = code.getByTestId('card-assignee');
  await avatar.click();
  await page.getByRole('menuitemradio', { name: 'Dana Director' }).click();
  await expect(avatar).toHaveAccessibleName('Assignee of Steering: Dana Director');
  await page.reload();
  await expect(avatar).toHaveAccessibleName('Assignee of Steering: Dana Director');

  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  await page.getByRole('button', { name: 'Flight behavior actions', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.action-popover:popover-open')).toHaveCount(0);
  await page.getByLabel('Visible column').selectOption('done');
  await expect(page.getByLabel('Visible column')).toHaveValue('done');
  await expect(page.getByTestId('lane-done')).toBeInViewport();
  // The strip is as tall as the lane in view, not as the taller Must Have lane beside it.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bottom = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect().bottom;
        return bottom('.lanes') - bottom('[data-testid="lane-done"]');
      }),
    )
    .toBeLessThan(24);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }

  // Between phone and desktop, lanes that do not fit are announced and reachable without a drag.
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.getByRole('button', { name: /^Show earlier columns, \d hidden$/ }).click();
  await expect(page.getByRole('button', { name: /^Show later columns, \d hidden$/ })).toBeVisible();
});
