import { expect, test, type Page } from '@playwright/test';
import { activateFromBacklog, createWorkboard, signIn } from './helpers.ts';

async function addTask(page: Page, group: 'code' | 'assets', title: string, assignee?: string) {
  const tasks = page.getByTestId(`tasks-${group}`);
  await tasks.getByLabel(`New ${group === 'code' ? 'Code' : 'Assets'} task`).fill(title);
  await tasks.getByRole('button', { name: 'Add' }).click();
  const row = tasks.getByTestId('task-row').filter({ hasText: title });
  await expect(row).toBeVisible();
  if (!assignee) return;
  await row.getByTestId('card-assignee').click();
  await page
    .getByRole('menu', { name: `Assign ${title}` })
    .getByRole('menuitemradio', { name: assignee })
    .click();
  await expect(row.getByTestId('card-assignee')).toHaveAccessibleName(
    `Assignee of ${title}: ${assignee}`,
  );
}

/** The filters live in a menu behind an icon; Escape puts the menu away again. */
async function setFilter(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page
    .getByRole('group', { name: 'Filters', exact: true })
    .getByLabel(label)
    .selectOption({ label: option });
  await page.keyboard.press('Escape');
}

test('the Backlog and the Workboard filter their cards by title, assignee, type, item, and scope', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Filter project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const member = page.getByRole('form', { name: 'Add member' });
  await member.getByLabel('Email').fill('developer@gameweld.local');
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Project sections' });
  await tabs.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  for (const title of ['Ranged enemy', 'Flying enemy', 'Main menu']) {
    await must.getByLabel('New item in Must Have').fill(title);
    await must.getByRole('button', { name: 'Add' }).click();
    await expect(must.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }
  // Ranged enemy: Devin's code, nobody's assets. Flying enemy: Dana's assets. Main menu: nothing.
  await must.getByRole('link', { name: 'Ranged enemy', exact: true }).click();
  await addTask(page, 'code', 'Targeting', 'Devin Developer');
  await addTask(page, 'assets', 'Attack animation');
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Flying enemy', exact: true })).toBeVisible();
  await addTask(page, 'assets', 'Swoop animation', 'Dana Director');

  await tabs.getByRole('link', { name: 'Backlog' }).click();
  const filters = page.getByTestId('card-filters');
  const items = must.getByTestId('item-card');
  await expect(items).toHaveCount(3);
  // Search and filters wait behind their icons: until one is used, nothing sits above the lanes.
  await expect(filters).toHaveCount(0);
  const filterIcon = page.getByRole('button', { name: 'Filters', exact: true });
  const menu = page.getByRole('group', { name: 'Filters', exact: true });
  await filterIcon.click();
  // The Workboard's own two filters are not on the Backlog.
  await expect(menu.getByLabel('Assignee')).toBeVisible();
  await expect(menu.getByLabel('Backlog item')).toHaveCount(0);
  await expect(menu.getByLabel('Out of scope only')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // An item matches through its tasks: the person and the kind must meet in one task.
  await setFilter(page, 'Assignee', 'Devin Developer');
  await expect(items).toHaveText([/Ranged enemy/]);
  await expect(filters).toContainText('Showing 1 of 3 items');
  // The icon counts the filters that are on.
  await expect(filterIcon).toHaveText('1');
  await expect(must.locator('.lane-head .count')).toHaveText('1/3');
  await setFilter(page, 'Type', 'Assets');
  await expect(items).toHaveCount(0);
  await expect(must).toContainText('No matching cards');
  await setFilter(page, 'Assignee', 'Unassigned');
  await expect(items).toHaveText([/Ranged enemy/]);
  await setFilter(page, 'Assignee', 'Anyone');
  await expect(items).toHaveText([/Ranged enemy/, /Flying enemy/]);
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await expect(items).toHaveCount(3);
  await expect(filters).toHaveCount(0);
  await expect(filterIcon).toHaveText('');

  // The search icon brings the field out beside it, focused; Escape, or the icon again, puts it
  // away with its text.
  const searchIcon = page.getByRole('button', { name: 'Search titles' });
  const search = page.getByRole('searchbox', { name: 'Search titles' });
  await searchIcon.click();
  await expect(search).toBeFocused();
  const [field, icon] = [(await search.boundingBox())!, (await filterIcon.boundingBox())!];
  expect(Math.abs(field.y + field.height / 2 - (icon.y + icon.height / 2))).toBeLessThan(4);
  expect(icon.x - (field.x + field.width)).toBeLessThan(60);
  await page.keyboard.type('ENEMY');
  await expect(items).toHaveText([/Ranged enemy/, /Flying enemy/]);
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(items).toHaveCount(3);
  await searchIcon.click();
  await search.fill('menu');
  await expect(items).toHaveText([/Main menu/]);
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(search).toHaveCount(0);
  await expect(items).toHaveCount(3);
  await searchIcon.click();
  await search.fill('enemy');
  await expect(items).toHaveText([/Ranged enemy/, /Flying enemy/]);

  // While cards are hidden, places among the ones showing mean nothing: no reordering.
  await page.getByRole('button', { name: 'Flying enemy actions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Flying enemy up' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  // The Workboard: both items' tasks, one of them placed from outside the scope.
  await tabs.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  await tabs.getByRole('link', { name: 'Breakdown' }).click();
  await page
    .getByTestId('item-nav')
    .getByRole('link', { name: /Flying enemy/ })
    .click();
  const addSwoop = page.getByRole('button', { name: 'Add Swoop animation to Workboard' });
  await addSwoop.click();
  // Leaving before the placement lands would open a Workboard without it.
  await expect(addSwoop).toHaveCount(0);
  await tabs.getByRole('link', { name: 'Workboard' }).click();
  const cards = page.getByTestId('workboard').getByTestId('item-card');
  await expect(cards).toHaveCount(3);

  await setFilter(page, 'Assignee', 'Dana Director');
  await expect(cards).toHaveText([/Swoop animation/]);
  await expect(filters).toContainText('Showing 1 of 3 tasks');
  // The filters are the viewer's for the visit, and the Backlog shares them.
  await tabs.getByRole('link', { name: 'Backlog' }).click();
  await expect(items).toHaveText([/Flying enemy/]);
  await tabs.getByRole('link', { name: 'Workboard' }).click();
  await expect(cards).toHaveText([/Swoop animation/]);
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  await setFilter(page, 'Type', 'Assets');
  await expect(cards).toHaveText([/Attack animation/, /Swoop animation/]);
  await setFilter(page, 'Backlog item', 'Ranged enemy');
  await expect(cards).toHaveText([/Attack animation/]);
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await filterIcon.click();
  await menu.getByLabel('Out of scope only').check();
  await expect(cards).toHaveText([/Swoop animation/]);
  await menu.getByLabel('Out of scope only').uncheck();
  await page.keyboard.press('Escape');
  await searchIcon.click();
  await search.fill('target');
  await expect(cards).toHaveText([/Targeting/]);

  // A filtered card still moves to another column, where it joins the end.
  const making = page.getByRole('region', { name: 'Done' });
  const from = (await cards.first().boundingBox())!;
  const to = (await making.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(making.getByTestId('item-card')).toHaveText([/Targeting/]);
  await expect(page.getByTestId('board-counts')).toContainText('1/3 tasks done');
});
