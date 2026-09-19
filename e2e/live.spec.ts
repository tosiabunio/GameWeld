import { expect, test } from '@playwright/test';
import { activateFromBacklog, createWorkboard, signIn, taskModal } from './helpers.ts';

test('what one member does shows up for another without a reload', async ({ browser }) => {
  const directorContext = await browser.newContext();
  const developerContext = await browser.newContext();
  const director = await directorContext.newPage();
  const developer = await developerContext.newPage();
  try {
    await signIn(director, 'director');
    await director.getByRole('link', { name: 'New project' }).click();
    await director.getByLabel('Name', { exact: true }).fill('Live project');
    await director.getByRole('button', { name: 'Create project' }).click();
    const member = director.getByRole('form', { name: 'Add member' });
    await member.getByLabel('Email').fill('developer@gameweld.local');
    await member.getByRole('button', { name: 'Add member' }).click();
    await expect(director.getByTestId('member-developer@gameweld.local')).toBeVisible();
    await director.getByRole('link', { name: 'Backlog', exact: true }).click();
    const must = director.getByTestId('lane-must');
    await must.getByLabel('New item in Must Have').fill('Boss fight');
    await must.getByRole('button', { name: 'Add', exact: true }).click();
    await must.getByRole('link', { name: 'Boss fight', exact: true }).click();
    const code = director.getByTestId('tasks-code');
    await code.getByLabel('New Code task').fill('Phase one');
    await code.getByRole('button', { name: 'Add' }).click();
    await expect(code.getByTestId('task-row')).toHaveCount(1);
    await director.getByRole('link', { name: 'Workboard' }).click();
    await createWorkboard(director, 'Sprint 1');
    await activateFromBacklog(director, 'Boss fight');
    const board = director.url();

    // The Developer opens the same board and then only watches.
    await signIn(developer, 'developer');
    await developer.goto(board);
    const theirCards = developer.getByTestId('workboard').getByTestId('item-card');
    await expect(theirCards).toHaveText([/Phase one/]);
    const watching = await developer.evaluate(() => performance.timeOrigin);

    // A card the Director adds appears on the Developer's board.
    await director
      .getByRole('region', { name: 'To Do · Code' })
      .getByRole('button', { name: 'New Code task' })
      .click();
    const form = director.getByRole('form', { name: 'New Code task' });
    await form.getByLabel('Title').fill('Phase two');
    await form.getByRole('button', { name: 'Add to board' }).click();
    await expect(theirCards).toHaveText([/Phase one/, /Phase two/]);

    // So does a rename made in a task's window, even while the Developer has that window open.
    await theirCards.filter({ hasText: 'Phase two' }).click({ position: { x: 6, y: 6 } });
    await expect(taskModal(developer).getByRole('heading', { name: 'Phase two' })).toBeVisible();
    await director
      .getByTestId('item-card')
      .filter({ hasText: 'Phase two' })
      .click({ position: { x: 6, y: 6 } });
    await taskModal(director).getByRole('button', { name: 'Edit task' }).click();
    await taskModal(director).getByLabel('Title').fill('Phase two, enraged');
    await taskModal(director).getByRole('button', { name: 'Save' }).click();
    await expect(
      taskModal(developer).getByRole('heading', { name: 'Phase two, enraged' }),
    ).toBeVisible();

    // A task given to the Developer rings their bell at once. Earlier tests may have left this
    // persona notifications of their own, so the count is compared with what it was.
    const count = developer.getByTestId('notification-count');
    const before = (await count.count()) === 0 ? 0 : Number(await count.textContent());
    await taskModal(director).getByLabel('Assignee').selectOption({ label: 'Devin Developer' });
    await expect(count).toHaveText(String(before + 1));
    await taskModal(developer).getByRole('button', { name: 'Close task' }).click();
    await expect(theirCards.filter({ hasText: 'Phase two, enraged' })).toBeVisible();
    // None of it took a reload of the Developer's page.
    expect(await developer.evaluate(() => performance.timeOrigin)).toBe(watching);
  } finally {
    await directorContext.close();
    await developerContext.close();
  }
});
