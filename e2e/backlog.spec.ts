import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, persona: string) {
  await page.goto('/');
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

test('Section 15: a Director creates a vague item, reorders it, and edits its description', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Lane project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog' }).click();

  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Make the game fun');
  await must.getByRole('button', { name: 'Add' }).click();
  await expect(must.getByTestId('item-card')).toHaveCount(1);
  await must.getByLabel('New item in Must Have').fill('Ranged enemy');
  await must.getByRole('button', { name: 'Add' }).click();
  await expect(must.getByTestId('item-card')).toHaveCount(2);
  await expect(must.getByTestId('item-card').nth(1)).toContainText('Ranged enemy');

  // Non-drag reordering.
  await must.getByLabel('Move Ranged enemy up').click();
  await expect(must.getByTestId('item-card').nth(0)).toContainText('Ranged enemy');

  // Recategorize through the select.
  await must.getByLabel('Move Make the game fun to category').selectOption('should');
  const should = page.getByTestId('lane-should');
  await expect(should.getByTestId('item-card')).toHaveCount(1);
  await expect(must.getByTestId('item-card')).toHaveCount(1);

  // Open the item and add a free-form description and a link.
  await should.getByRole('link', { name: 'Make the game fun' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Make the game fun');
  await page
    .getByLabel('Description')
    .fill('Whatever that means. No estimate, no acceptance criteria, and that is fine.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const addLink = page.getByRole('form', { name: 'Add link' });
  await addLink.getByLabel('URL').fill('https://example.com/pitch');
  await addLink.getByLabel('Label').fill('Pitch deck');
  await addLink.getByRole('button', { name: 'Add link' }).click();
  await expect(page.getByRole('link', { name: 'Pitch deck' })).toBeVisible();
});

test('a Developer browses the Backlog without editing controls', async ({ page }) => {
  await signIn(page, 'developer');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await expect(page.getByTestId('backlog')).toBeVisible();
  const must = page.getByTestId('lane-must');
  await expect(must.getByTestId('item-card').filter({ hasText: 'Ranged enemy' })).toContainText(
    '0/3 tasks',
  );
  await expect(must.getByTestId('item-card').filter({ hasText: 'Ranged enemy' })).toContainText(
    'On September production',
  );
  await expect(page.getByLabel(/^New item in/)).toHaveCount(0);
  await expect(page.getByLabel(/^Move .* up$/)).toHaveCount(0);

  await must.getByRole('link', { name: 'Ranged enemy' }).click();
  await expect(page.getByLabel('Description')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
});

test('cards can be dragged between lanes and reordered within a lane', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Drag project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog' }).click();

  const must = page.getByTestId('lane-must');
  const should = page.getByTestId('lane-should');
  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    await must.getByLabel('New item in Must Have').fill(title);
    await must.getByRole('button', { name: 'Add' }).click();
    await expect(must.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }

  async function drag(
    source: ReturnType<typeof page.locator>,
    target: ReturnType<typeof page.locator>,
    yOffset = 0,
  ) {
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + yOffset, { steps: 12 });
    await page.mouse.up();
  }

  // Drag Gamma above Alpha within Must Have.
  await drag(
    must.getByTestId('item-card').filter({ hasText: 'Gamma' }),
    must.getByTestId('item-card').filter({ hasText: 'Alpha' }),
    -20,
  );
  await expect(must.getByTestId('item-card').nth(0)).toContainText('Gamma');
  await expect(must.getByTestId('item-card').nth(2)).toContainText('Beta');

  // Drag Beta into the empty Should Have lane.
  await drag(must.getByTestId('item-card').filter({ hasText: 'Beta' }), should);
  await expect(should.getByTestId('item-card')).toHaveCount(1);
  await expect(should.getByTestId('item-card').first()).toContainText('Beta');
  await expect(must.getByTestId('item-card')).toHaveCount(2);

  // The order survives a reload, so it was persisted.
  await page.reload();
  await expect(page.getByTestId('lane-should').getByTestId('item-card').first()).toContainText(
    'Beta',
  );
  await expect(page.getByTestId('lane-must').getByTestId('item-card').nth(0)).toContainText(
    'Gamma',
  );
});

test('a Director activates an item straight from its Backlog card', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  // The demo board has Ranged enemy in scope; Flying enemy is next in priority.
  const flying = page
    .getByTestId('lane-must')
    .getByTestId('item-card')
    .filter({ hasText: 'Flying enemy' });
  await flying.getByRole('button', { name: 'Add Flying enemy to Workboard' }).click();
  await flying
    .getByRole('group', { name: 'Activate Flying enemy' })
    .getByRole('button', { name: 'Activate' })
    .click();
  await expect(flying).toContainText('On September production');
  await expect(flying.getByRole('button', { name: 'Add Flying enemy to Workboard' })).toHaveCount(
    0,
  );
  // A lower-priority item is refused with an explanation naming the next item.
  const tooling = page
    .getByTestId('lane-could')
    .getByTestId('item-card')
    .filter({ hasText: 'Improve level iteration tooling' });
  await tooling
    .getByRole('button', { name: 'Add Improve level iteration tooling to Workboard' })
    .click();
  await tooling
    .getByRole('group', { name: 'Activate Improve level iteration tooling' })
    .getByRole('button', { name: 'Activate' })
    .click();
  await expect(page.getByRole('alert')).toContainText('"Boss arena" is next in priority');
});
