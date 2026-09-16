import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, persona: string) {
  await page.goto('/');
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

async function createProjectWithItems(page: Page, name: string) {
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Workboard scope limit').fill('1');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog' }).click();
  const must = page.getByTestId('lane-must');
  for (const title of ['Ranged enemy', 'Flying enemy']) {
    await must.getByLabel('New item in Must Have').fill(title);
    await must.getByRole('button', { name: 'Add' }).click();
    await expect(must.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }
  // Two tasks under Ranged enemy.
  await must.getByRole('link', { name: 'Ranged enemy' }).click();
  await page.getByTestId('tasks-code').getByLabel('New Code task').fill('Targeting');
  await page.getByTestId('tasks-code').getByRole('button', { name: 'Add' }).click();
  await page.getByTestId('tasks-assets').getByLabel('New Assets task').fill('Attack animation');
  await page.getByTestId('tasks-assets').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(1);
}

test('Director creates a board, activates the next item, hits the limit, renames a column', async ({
  page,
}) => {
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Board project');
  await page.getByRole('link', { name: 'Workboard' }).click();

  await page.getByRole('form', { name: 'Create Workboard' }).getByLabel('Name').fill('Sprint 1');
  await page.getByRole('button', { name: 'Create Workboard' }).click();
  await expect(page.getByTestId('workboard')).toBeVisible();
  await expect(page.getByTestId('board-counts')).toContainText('0/1 items in scope');

  // Section 15 "Director activates a permitted item".
  await page.getByRole('button', { name: 'Add next item: Ranged enemy' }).click();
  await expect(
    page.getByText('Tasks created later in Breakdown are not placed automatically'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const columns = page.locator('[data-testid^="column-"]');
  await expect(columns.nth(0).getByTestId('item-card')).toContainText('Targeting');
  await expect(columns.nth(1).getByTestId('item-card')).toContainText('Attack animation');
  await expect(page.getByTestId('board-counts')).toContainText('1/1 items in scope');

  // Section 15 "User exceeds the configured scope limit".
  await expect(page.getByRole('button', { name: 'Scope limit reached' })).toBeDisabled();

  // Section 15 "Team renames an intermediate column".
  await page.getByRole('button', { name: 'Add column after To Do · Content' }).click();
  await page.getByLabel('New column name').fill('Making');
  await page.getByRole('form', { name: 'Add column' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('region', { name: 'Making' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename column Making' }).click();
  await page.getByLabel('Column name').fill('In progress');
  await page
    .getByRole('form', { name: 'Rename column Making' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByRole('region', { name: 'In progress' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Done' })).toBeVisible();

  // Return to Breakdown asks first, then says where the task went.
  await page
    .getByRole('button', { name: 'Return Attack animation to Breakdown', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Confirm returning Attack animation' })
    .getByRole('button', { name: 'Return' })
    .click();
  await expect(page.getByTestId('board-notice')).toContainText(
    '“Attack animation” returned to Breakdown.',
  );
  await expect(page.getByTestId('item-card').filter({ hasText: 'Attack animation' })).toHaveCount(
    0,
  );
  await page.getByTestId('board-notice').getByRole('link', { name: 'Open Ranged enemy' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row').first()).toContainText(
    'Unplaced',
  );
});

test('Developer creates cards: default parent with one item in scope, choice with several', async ({
  page,
}) => {
  // Set up as Director with a limit of 2, then switch to the Developer persona.
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Card project');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Workboard scope limit').fill('2');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  const add = page.getByRole('form', { name: 'Add member' });
  await add.getByLabel('Email').fill('developer@gameweld.local');
  await add.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Workboard' }).click();
  await page.getByRole('form', { name: 'Create Workboard' }).getByLabel('Name').fill('Sprint 1');
  await page.getByRole('button', { name: 'Create Workboard' }).click();
  await page.getByRole('button', { name: 'Add next item: Ranged enemy' }).click();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const url = page.url();

  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByTestId('persona-developer').click();
  await page.goto(url);

  // One item in scope: the parent is preselected.
  const codeColumn = page.locator('[data-testid^="column-"]').nth(0);
  await codeColumn.getByRole('button', { name: 'New Code task' }).click();
  const form = page.getByRole('form', { name: 'New Code task' });
  await expect(form.getByLabel('Parent backlog item')).toHaveValue(/.+/);
  await expect(form.getByText('The only item in scope, selected by default.')).toBeVisible();
  await form.getByLabel('Title').fill('Hit reaction');
  await form.getByRole('button', { name: 'Add to board' }).click();
  await expect(
    codeColumn.getByTestId('item-card').filter({ hasText: 'Hit reaction' }),
  ).toContainText('Ranged enemy');
  await expect(page.getByRole('button', { name: /Add next item/ })).toHaveCount(0); // not a Director

  // Several items in scope: Director activates a second item, then the Developer must choose.
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByTestId('persona-director').click();
  await page.goto(url);
  await page.getByRole('button', { name: 'Add next item: Flying enemy' }).click();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByTestId('scope-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByTestId('persona-developer').click();
  await page.goto(url);
  await codeColumn.getByRole('button', { name: 'New Code task' }).click();
  const form2 = page.getByRole('form', { name: 'New Code task' });
  await form2.getByLabel('Title').fill('Wing physics');
  await expect(form2.getByRole('button', { name: 'Add to board' })).toBeDisabled();
  await form2.getByLabel('Parent backlog item').selectOption({ label: 'Flying enemy' });
  await form2.getByRole('button', { name: 'Add to board' }).click();
  await expect(
    codeColumn.getByTestId('item-card').filter({ hasText: 'Wing physics' }),
  ).toContainText('Flying enemy');
});

test('dragging a card into Done completes its task and the item becomes Ready for Review', async ({
  page,
}) => {
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Done project');
  await page.getByRole('link', { name: 'Workboard' }).click();
  await page.getByRole('form', { name: 'Create Workboard' }).getByLabel('Name').fill('Sprint 1');
  await page.getByRole('button', { name: 'Create Workboard' }).click();
  await page.getByRole('button', { name: 'Add next item: Ranged enemy' }).click();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByTestId('scope-item')).toHaveCount(1);

  const done = page.getByRole('region', { name: 'Done' });
  for (const title of ['Targeting', 'Attack animation']) {
    const card = page.getByTestId('item-card').filter({ hasText: title });
    const from = (await card.boundingBox())!;
    const to = (await done.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
    await page.mouse.up();
    await expect(done.getByTestId('item-card').filter({ hasText: title })).toBeVisible();
  }
  await expect(page.getByTestId('board-counts')).toContainText('2/2 tasks done');
  await expect(page.getByTestId('scope-item').first()).toContainText('Ready for Review');
  await page.getByRole('link', { name: 'Backlog' }).click();
  await expect(page.getByTestId('lane-ready_for_review').getByTestId('item-card')).toContainText(
    'Ranged enemy',
  );
});
