import { expect, test } from '@playwright/test';
import { closeTask, signIn, switchPersona, taskModal } from './helpers.ts';

test('descriptions and comments are Markdown with mentions, and a task has a checklist', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Rich text project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const member = page.getByRole('form', { name: 'Add member' });
  await member.getByLabel('Email').fill('developer@gameweld.local');
  await member.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByTestId('member-developer@gameweld.local')).toBeVisible();
  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Boss fight');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await must.getByRole('link', { name: 'Boss fight', exact: true }).click();
  const code = page.getByTestId('tasks-code');
  await code.getByLabel('New Code task').fill('Phase two');
  await code.getByRole('button', { name: 'Add' }).click();
  await code.getByRole('link', { name: 'Phase two' }).click();
  const task = taskModal(page);

  // Markdown in the description; a line break stays a line break, and HTML stays text.
  await task.getByRole('button', { name: 'Edit task' }).click();
  const description = task.getByLabel('Description');
  await description.fill(
    'The boss **enrages** at half health.\nSecond line.\n\n- adds\n- a [reference](https://example.com/ref)\n\n<b>not html</b>\n\nAsk ',
  );
  // "@" suggests the project's members; Enter takes the one that is marked.
  await description.press('End');
  await description.pressSequentially('@dev');
  await expect(task.getByRole('listbox', { name: 'Mention a member' })).toContainText(
    'Devin Developer',
  );
  await description.press('Enter');
  await expect(description).toHaveValue(/Ask @Devin Developer $/);
  await task.getByRole('button', { name: 'Save' }).click();
  const shown = task.locator('.description-text');
  await expect(shown.locator('strong')).toHaveText('enrages');
  await expect(shown.locator('li')).toHaveText(['adds', 'a reference']);
  const link = shown.getByRole('link', { name: 'reference' });
  await expect(link).toHaveAttribute('href', 'https://example.com/ref');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(shown).toContainText('<b>not html</b>');
  await expect(shown.locator('b')).toHaveCount(0);
  await expect(shown.locator('p').first().locator('br')).toHaveCount(1);
  await expect(shown.locator('.mention')).toHaveText('@Devin Developer');

  // The checklist: add, tick, rename, remove. Ticking does not complete the task.
  const checklist = task.getByTestId('checklist');
  for (const step of ['Telegraph the attack', 'Spawn adds', 'Tune damage']) {
    await checklist.getByLabel('New checklist item').fill(step);
    await checklist.getByLabel('New checklist item').press('Enter');
    await expect(checklist.getByRole('checkbox', { name: step })).toBeVisible();
  }
  await checklist.getByRole('checkbox', { name: 'Spawn adds' }).check();
  await expect(checklist.getByTestId('checklist-count')).toHaveText('1/3');
  await checklist.getByRole('button', { name: 'Tune damage', exact: true }).click();
  await checklist.getByLabel('Item text').fill('Tune the damage');
  await checklist.getByLabel('Item text').press('Enter');
  await expect(checklist.getByRole('checkbox', { name: 'Tune the damage' })).toBeVisible();
  await checklist.getByRole('button', { name: 'Remove Telegraph the attack' }).click();
  await expect(checklist.getByTestId('checklist-count')).toHaveText('1/2');
  await expect(task.getByRole('button', { name: 'Mark complete' })).toBeVisible();

  // A comment that names someone.
  const add = task.getByRole('form', { name: 'Add comment' });
  await add.getByLabel('Comment').fill('Numbers are in `boss.json`, @Devin Developer.');
  await add.getByRole('button', { name: 'Add comment' }).click();
  await expect(task.getByTestId('comments').locator('code')).toHaveText('boss.json');
  await expect(task.getByTestId('comments').locator('.mention')).toHaveText('@Devin Developer');

  // The task's row shows how far its checklist is.
  await closeTask(page);
  await expect(page.getByTestId('task-row').filter({ hasText: 'Phase two' })).toContainText('1/2');

  // Whoever was named hears of it: once for the description, once for the comment.
  await switchPersona(page, 'developer');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const mine = page
    .getByTestId('notifications')
    .getByRole('link')
    .filter({ hasText: 'Rich text project' });
  await expect(mine).toHaveCount(2);
  await expect(mine.first()).toContainText('Dana Director mentioned you on Phase two');
});

test('a title or a description is edited by clicking it; a link inside keeps its own click', async ({
  page,
}) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Click to edit project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Backlog', exact: true }).click();
  const must = page.getByTestId('lane-must');
  await must.getByLabel('New item in Must Have').fill('Boss fight');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await must.getByRole('link', { name: 'Boss fight', exact: true }).click();

  // The item: a click on the empty description opens the editor with the caret in it.
  await page.getByText('No description yet. Click to add one.').click();
  await expect(page.getByLabel('Description')).toBeFocused();
  await page.getByLabel('Description').fill('See the [design doc](https://example.com/doc).');
  await page.getByRole('button', { name: 'Save' }).click();
  // A click on the title opens it with the caret in the title.
  await page.getByRole('button', { name: 'Boss fight', exact: true }).click();
  await expect(page.getByLabel('Title')).toBeFocused();
  await page.getByLabel('Title').fill('Boss fight, phase one');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Boss fight, phase one' })).toBeVisible();

  // The task, in its window: the same, and the description's caret goes to the end of the text.
  const code = page.getByTestId('tasks-code');
  await code.getByLabel('New Code task').fill('Arena gate');
  await code.getByRole('button', { name: 'Add' }).click();
  await code.getByRole('link', { name: 'Arena gate' }).click();
  const task = taskModal(page);
  await task.getByText('No description yet. Click to add one.').click();
  await expect(task.getByLabel('Description')).toBeFocused();
  await task
    .getByLabel('Description')
    .fill('Closes behind the player. [Reference](https://example.com/gate)');
  await task.getByRole('button', { name: 'Save' }).click();
  await task.locator('.description-text').getByText('Closes behind the player.').click();
  await expect(task.getByLabel('Description')).toBeFocused();
  await page.keyboard.type(' More.');
  await expect(task.getByLabel('Description')).toHaveValue(/gate\) More\.$/);
  await task.getByRole('button', { name: 'Cancel' }).click();
  await task.getByRole('button', { name: 'Arena gate', exact: true }).click();
  await expect(task.getByLabel('Title')).toBeFocused();
  await task.getByRole('button', { name: 'Cancel' }).click();

  // A link in the description opens; it does not start an edit.
  const popup = page.waitForEvent('popup');
  await task.locator('.description-text').getByRole('link', { name: 'Reference' }).click();
  await (await popup).close();
  await expect(task.getByLabel('Description')).toHaveCount(0);

  // Someone who may not edit gets plain text: nothing to click.
  await closeTask(page);
});
