import { expect, test, type Page } from '@playwright/test';
import { pressAndSettle, signIn } from './helpers.ts';

async function assign(page: Page, title: string, person: string) {
  await page
    .getByTestId('task-row')
    .filter({ hasText: title })
    .getByTestId('card-assignee')
    .click();
  await page
    .getByRole('menu', { name: `Assign ${title}` })
    .getByRole('menuitemradio', { name: person })
    .click();
  await expect(
    page.getByTestId('task-row').filter({ hasText: title }).getByTestId('card-assignee'),
  ).toHaveAccessibleName(`Assignee of ${title}: ${person === 'Unassigned' ? 'nobody' : person}`);
}

test('My tasks appears with the first assigned task, and its cards take the viewer’s order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('My tasks project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const tabs = page.getByRole('navigation', { name: 'Project sections' });
  await tabs.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Ranged enemy');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await must.getByRole('link', { name: 'Ranged enemy', exact: true }).click();
  const code = page.getByTestId('tasks-code');
  for (const [i, title] of ['Alpha', 'Beta', 'Gamma', 'Delta'].entries()) {
    await code.getByLabel('New Code task').fill(title);
    await code.getByRole('button', { name: 'Add' }).click();
    await expect(code.getByTestId('task-row')).toHaveCount(i + 1);
  }

  // Nothing is assigned to the viewer, so there is no tab; the first assignment brings it, first.
  await expect(tabs.getByRole('link')).toHaveText(['Backlog', 'Breakdown', 'Workboard']);
  for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta'])
    await assign(page, title, 'Dana Director');
  await expect(tabs.getByRole('link')).toHaveText([
    'My tasks',
    'Backlog',
    'Breakdown',
    'Workboard',
  ]);

  await tabs.getByRole('link', { name: 'My tasks' }).click();
  const board = page.getByTestId('my-tasks');
  const cards = board.getByTestId('my-task-card');
  await expect(cards).toHaveText([/Alpha/, /Beta/, /Gamma/, /Delta/]);
  await expect(cards.first()).toContainText('Ranged enemy');

  // A free board: the cards fill a row from the left before they start the next one.
  await page.setViewportSize({ width: 700, height: 900 });
  const boxes = async () =>
    Promise.all((await cards.all()).map(async (c) => (await c.boundingBox())!));
  const [first, second, third] = await boxes();
  expect(second!.y).toBe(first!.y);
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(third!.y).toBeGreaterThan(first!.y);
  expect(third!.x).toBe(first!.x);

  // Dragging a card onto another takes its place; the numbers follow the order.
  const gamma = (await cards.nth(2).boundingBox())!;
  const alpha = (await cards.nth(0).boundingBox())!;
  await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + gamma.height / 2);
  await page.mouse.down();
  await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + gamma.height / 2 - 20, { steps: 4 });
  await page.mouse.move(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(cards).toHaveText([/Gamma/, /Alpha/, /Beta/, /Delta/]);
  await expect(cards.first().getByLabel('Priority 1 of 4')).toHaveText('1');

  // So does the keyboard: right is the next card, down is the next row.
  await cards.filter({ hasText: 'Gamma' }).focus();
  for (const key of ['Space', 'ArrowRight', 'Space']) await pressAndSettle(page, key);
  await expect(cards).toHaveText([/Alpha/, /Gamma/, /Beta/, /Delta/]);
  await cards.filter({ hasText: 'Alpha' }).focus();
  for (const key of ['Space', 'ArrowDown', 'Space']) await pressAndSettle(page, key);
  await expect(cards).toHaveText([/Gamma/, /Beta/, /Alpha/, /Delta/]);

  // The order is kept on the server, and the task page knows the way back.
  await page.reload();
  await expect(cards).toHaveText([/Gamma/, /Beta/, /Alpha/, /Delta/]);
  await cards.getByRole('link', { name: 'Alpha' }).click();
  await page.getByRole('link', { name: '← My tasks' }).click();
  await expect(cards).toHaveCount(4);

  // Handing the last tasks away takes the tab away again.
  await tabs.getByRole('link', { name: 'Breakdown' }).click();
  await page.getByRole('link', { name: /^Ranged enemy/ }).click();
  for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta']) await assign(page, title, 'Unassigned');
  await expect(tabs.getByRole('link')).toHaveText(['Backlog', 'Breakdown', 'Workboard']);
});
