import { expect, test, type Page } from '@playwright/test';
import {
  activateFromBacklog,
  createWorkboard,
  dropFile,
  expectCoverFrame,
  pressAndSettle,
  signIn,
  switchPersona,
  TINY_PNG,
} from './helpers.ts';

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

  await createWorkboard(page, 'Sprint 1');
  await expect(page.getByTestId('board-counts')).toContainText('0/1 items in scope');

  // Section 15 "Director activates a permitted item".
  await activateFromBacklog(page, 'Ranged enemy');
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const columns = page.locator('[data-testid^="column-"]');
  await expect(columns.nth(0).getByTestId('item-card')).toContainText('Targeting');
  await expect(columns.nth(1).getByTestId('item-card')).toContainText('Attack animation');
  await expect(page.getByTestId('board-counts')).toContainText('1/1 items in scope');

  // Section 15 "User exceeds the configured scope limit".
  await expect(page.getByTestId('scope')).toContainText('Scope limit reached');

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

  // Opening a card from the board leads back to the board.
  await page.getByRole('link', { name: 'Targeting' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Targeting');
  await page.getByRole('link', { name: '← Workboard' }).click();
  await expect(page.getByTestId('workboard')).toBeVisible();

  // The Director can rename the board; the name carries no rules.
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Workboard name').fill('Milestone 1');
  await page
    .getByRole('form', { name: 'Rename Workboard' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByRole('heading', { name: /Milestone 1/ })).toBeVisible();

  // Deleting a task removes it from the board and the item's active breakdown.
  await expect(page.getByRole('button', { name: /Return .* to Breakdown/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Attack animation', exact: true }).click();
  const confirmation = page.getByRole('group', { name: 'Confirm deleting Attack animation' });
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('item-card').filter({ hasText: 'Attack animation' })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Delete Attack animation', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete task' }).click();
  await expect(page.getByTestId('board-notice')).toContainText(
    '“Attack animation” deleted from “Ranged enemy”.',
  );
  await expect(page.getByTestId('item-card').filter({ hasText: 'Attack animation' })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('board-counts')).toContainText('0/1 tasks done');
  await page.getByTestId('board-notice').getByRole('link', { name: 'View deleted task' }).click();
  await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← Ranged enemy' }).click();
  await expect(page.getByTestId('tasks-assets').getByTestId('task-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show 1 deleted task', exact: true }).click();
  await page.getByRole('link', { name: 'Attack animation', exact: true }).click();
  await page.getByRole('button', { name: 'Restore task' }).click();
  await page.getByRole('link', { name: 'Workboard', exact: true }).click();
  await expect(page.getByTestId('item-card').filter({ hasText: 'Attack animation' })).toHaveCount(
    1,
  );
  await expect(page.getByTestId('board-counts')).toContainText('0/2 tasks done');
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
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  await expect(page.getByTestId('scope-item')).toHaveCount(1);
  const url = page.url();

  await switchPersona(page, 'developer');
  await page.goto(url);

  await expect(
    page.getByRole('button', { name: /^Delete (Targeting|Attack animation)$/ }),
  ).toHaveCount(0);

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
  // Not a Director: no activation controls on Backlog cards either.
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Backlog' })
    .click();
  await expect(page.getByRole('button', { name: /to Workboard$/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Workboard' }).click();

  // Several items in scope: Director activates a second item, then the Developer must choose.
  await switchPersona(page, 'director');
  await page.goto(url);
  await activateFromBacklog(page, 'Flying enemy');
  await expect(page.getByTestId('scope-item')).toHaveCount(2);
  await switchPersona(page, 'developer');
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
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
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

test('an image dropped on a Workboard card becomes the task cover', async ({ page }) => {
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Task cover project');
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');

  const card = page.getByTestId('item-card').filter({ hasText: 'Targeting' });
  await expect(card).toBeVisible();
  await expect(card.locator('img.cover')).toHaveCount(0);
  await dropFile(page, card, { name: 'reticle.png', type: 'image/png', base64: TINY_PNG });
  await expectCoverFrame(card);
  // The other task on the board keeps no cover.
  await expect(
    page.getByTestId('item-card').filter({ hasText: 'Attack animation' }).locator('img.cover'),
  ).toHaveCount(0);

  // On the task the image is an attachment marked as the cover, and its editor can clear it.
  await card.getByRole('link', { name: 'Targeting' }).click();
  await expect(page.getByTestId('attachment')).toContainText('reticle.png');
  await expect(page.getByTestId('attachment')).toContainText('cover');
  await page.getByRole('button', { name: 'Remove cover' }).click();
  await expect(page.getByRole('button', { name: 'Use as cover' })).toBeVisible();
  await page.getByRole('link', { name: '← Workboard' }).click();
  await expect(card).toBeVisible();
  await expect(card.locator('img.cover')).toHaveCount(0);
});

test('every Workboard card shows its assignee, and the avatar picks a new one', async ({
  page,
}) => {
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Assignee project');
  await page.getByRole('link', { name: 'Settings' }).click();
  const add = page.getByRole('form', { name: 'Add member' });
  await add.getByLabel('Email').fill('developer@gameweld.local');
  await add.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');

  // Unassigned cards show a "?" in the assignee's place.
  const card = page.getByTestId('item-card').filter({ hasText: 'Targeting' });
  const avatar = card.getByTestId('card-assignee');
  await expect(avatar).toHaveAccessibleName('Assignee of Targeting: nobody');
  await expect(avatar).toHaveText('?');
  // It shares the title's first line instead of adding a row to the card.
  const [avatarBox, titleBox] = [
    await avatar.boundingBox(),
    await card.getByRole('link', { name: 'Targeting' }).boundingBox(),
  ];
  expect(Math.abs(avatarBox!.y - titleBox!.y)).toBeLessThan(8);

  // One click lists the members; one more assigns.
  await avatar.click();
  const menu = page.getByRole('menu', { name: 'Assign Targeting' });
  const choices = menu.getByRole('menuitemradio');
  await expect(choices).toHaveCount(3);
  for (const [i, name] of ['Unassigned', 'Dana Director', 'Devin Developer'].entries())
    await expect(choices.nth(i)).toHaveAccessibleName(name);
  await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveAccessibleName(
    'Unassigned',
  );
  await menu.getByRole('menuitemradio', { name: 'Devin Developer' }).click();
  await expect(menu).toHaveCount(0);
  await expect(avatar).toHaveAccessibleName('Assignee of Targeting: Devin Developer');
  await expect(avatar).toHaveText('DD');
  await expect(
    page
      .getByTestId('item-card')
      .filter({ hasText: 'Attack animation' })
      .getByTestId('card-assignee'),
  ).toHaveText('?');

  // The keyboard works too: the menu opens on the current choice, arrows move, Escape closes.
  await avatar.focus();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('menuitemradio', { name: 'Devin Developer' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(avatar).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitemradio', { name: 'Dana Director' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(avatar).toHaveAccessibleName('Assignee of Targeting: Dana Director');

  // A click outside dismisses without a change, and picking Unassigned clears the card.
  await avatar.click();
  await page.getByRole('heading', { name: 'Sprint 1' }).click();
  await expect(menu).toHaveCount(0);
  await avatar.click();
  await menu.getByRole('menuitemradio', { name: 'Unassigned' }).click();
  await expect(avatar).toHaveAccessibleName('Assignee of Targeting: nobody');

  // The task page assigns the moment a person is picked, and keeps unsaved text.
  await card.getByRole('link', { name: 'Targeting' }).click();
  await page.getByLabel('Description').fill('Lead the target by its speed.');
  await page.getByLabel('Assignee').selectOption({ label: 'Dana Director' });
  await expect(page.getByRole('status')).toHaveText('Assigned to Dana Director.');
  await expect(page.getByLabel('Description')).toHaveValue('Lead the target by its speed.');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('Assignee').locator('option:checked')).toHaveText('Dana Director');
  await expect(page.getByLabel('Description')).toHaveValue('');
  await page.getByRole('link', { name: '← Workboard' }).click();
  await expect(avatar).toHaveAccessibleName('Assignee of Targeting: Dana Director');
});

test('a card moves across the board by keyboard, skipping columns it cannot enter', async ({
  page,
}) => {
  await signIn(page, 'director');
  await createProjectWithItems(page, 'Keyboard board');
  await page.getByRole('link', { name: 'Workboard' }).click();
  await createWorkboard(page, 'Sprint 1');
  await activateFromBacklog(page, 'Ranged enemy');
  const code = page.getByRole('region', { name: 'To Do · Code' });
  const done = page.getByRole('region', { name: 'Done' });
  await expect(code.getByTestId('item-card')).toHaveText([/Targeting/]);

  // One Right passes the Assets and Content To Do columns, which only take their own tasks.
  await code.getByTestId('item-card').filter({ hasText: 'Targeting' }).focus();
  for (const key of ['Space', 'ArrowRight', 'Space']) await pressAndSettle(page, key);
  await expect(done.getByTestId('item-card')).toHaveText([/Targeting/]);
  await expect(code.getByTestId('item-card')).toHaveCount(0);

  // And one Left brings it back to its own To Do column.
  await done.getByTestId('item-card').filter({ hasText: 'Targeting' }).focus();
  for (const key of ['Space', 'ArrowLeft', 'Space']) await pressAndSettle(page, key);
  await expect(code.getByTestId('item-card')).toHaveText([/Targeting/]);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'To Do · Code' }).getByTestId('item-card'),
  ).toHaveText([/Targeting/]);
});
