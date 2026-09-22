import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { signIn } from './helpers.ts';

/** The browser tests share the server's database, where acceptances can be moved back in time. */
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://gameweld:gameweld@localhost:5433/gameweld_test';

async function newProject(page: Page, name: string) {
  await signIn(page, 'director');
  const post = async (url: string, data: object = {}) =>
    (await page.request.post(`/api${url}`, { data })).json();
  const project = (await post('/projects', { name })).id as string;
  return { project, post };
}

test('a long lane shows fifty cards, keeps its head and form in sight, and shows what joins it', async ({
  page,
}) => {
  const { project, post } = await newProject(page, 'Long lane');
  for (let n = 1; n <= 60; n++)
    await post(`/projects/${project}/backlog`, { title: `Level ${n}`, category: 'must' });
  await post(`/projects/${project}/backlog`, { title: 'Side quest', category: 'should' });
  await page.goto(`/projects/${project}/backlog`);
  const must = page.getByTestId('lane-must');
  const cards = must.getByTestId('item-card');
  await expect(cards).toHaveCount(50);
  await expect(must.locator('h3 .count')).toHaveText('60');
  await expect(must.getByRole('button', { name: 'Show 10 more' })).toBeAttached();

  // The lane fits the window: its cards scroll inside it, and the form for a new item is in sight.
  const lane = (await must.boundingBox())!;
  expect(lane.y + lane.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(must.getByLabel('New item in Must Have')).toBeInViewport();
  const body = must.locator('.lane-body');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true);

  // A new item shows, though the lane already shows fifty.
  await must.getByLabel('New item in Must Have').fill('Bonus level');
  await must.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(cards.filter({ hasText: 'Bonus level' })).toHaveCount(1);
  await expect(cards).toHaveCount(51);

  // Moved one place down, past the first fifty, a card stays in sight.
  // The menu closes when anything scrolls, so the card is brought into view first.
  await cards.filter({ hasText: 'Level 50' }).scrollIntoViewIfNeeded();
  await must.getByRole('button', { name: 'Level 50 actions', exact: true }).click();
  await page.getByRole('button', { name: 'Move Level 50 down' }).click();
  await expect(cards).toHaveCount(52);
  await expect(cards.nth(49)).toContainText('Level 51');
  await expect(cards.nth(50)).toContainText('Level 50');
  await expect(cards.nth(51)).toContainText('Bonus level');

  // A card dragged into the lane, scrolled to its end, lands where it was dropped.
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const target = (await cards.filter({ hasText: 'Level 49' }).boundingBox())!;
  const from = (await page.getByTestId('lane-should').getByTestId('item-card').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 20, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 - 10, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByTestId('lane-should').getByTestId('item-card')).toHaveCount(0);
  await expect(cards.nth(48)).toContainText('Side quest');
  await expect(cards.nth(49)).toContainText('Level 49');

  // The rest, and back to the first page.
  await must.getByRole('button', { name: /^Show \d+ more$/ }).click();
  await expect(cards).toHaveCount(62);
  await must.getByRole('button', { name: 'Show fewer' }).click();
  await expect(cards).toHaveCount(50);
});

test('Done shows what was accepted lately, and the rest by month behind "Show older"', async ({
  page,
}) => {
  const { project, post } = await newProject(page, 'Long done');
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const now = Date.now();
  const accepted = async (title: string, daysAgo: number) => {
    const item = (await post(`/projects/${project}/backlog`, { title, category: 'must' })).id;
    const task = (
      await post(`/projects/${project}/backlog/${item}/tasks`, { title: 'Work', category: 'code' })
    ).id;
    await post(`/projects/${project}/tasks/${task}/complete`);
    await post(`/projects/${project}/backlog/${item}/accept`);
    await db.query('UPDATE acceptances SET accepted_at = $2 WHERE item_id = $1', [
      item,
      new Date(now - daysAgo * 86_400_000),
    ]);
  };
  try {
    for (let n = 1; n <= 12; n++) await accepted(`Recent ${n}`, n);
    for (let n = 1; n <= 8; n++) await accepted(`Old ${n}`, 60 + n);
  } finally {
    await db.end();
  }
  const month = (daysAgo: number) =>
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
      new Date(now - daysAgo * 86_400_000),
    );

  await page.goto(`/projects/${project}/backlog`);
  const done = page.getByTestId('lane-done');
  const cards = done.getByTestId('item-card');
  // The twelve accepted in the last 30 days, newest first; the lane still counts all twenty.
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toContainText('Recent 1');
  await expect(cards.last()).toContainText('Recent 12');
  await expect(done.locator('h3 .count')).toHaveText('20');

  // The older ones come by month, and a month folds away.
  await done.getByRole('button', { name: 'Show 8 older' }).click();
  await expect(cards).toHaveCount(20);
  const heading = done.getByRole('button', { name: new RegExp(`^${month(61)}`, 'i') });
  await expect(heading).toBeVisible();
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expect(cards.filter({ hasText: 'Old 1' })).toHaveCount(0);
  await heading.click();
  await expect(cards.filter({ hasText: 'Old 1' })).toHaveCount(1);
  await done.getByRole('button', { name: 'Show fewer' }).click();
  await expect(cards).toHaveCount(12);

  // A search looks through all of Done.
  await page.getByRole('button', { name: 'Search titles' }).click();
  await page.getByRole('searchbox').fill('Old 3');
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(cards).toHaveCount(12);

  // A longer window, for this viewer, in this browser.
  await page.getByRole('button', { name: 'Display options' }).click();
  await page.getByLabel('Done shows items accepted').selectOption({ label: 'in the last 90 days' });
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(20);
  await page.reload();
  await expect(cards).toHaveCount(20);
  await page.getByRole('button', { name: 'Display options' }).click();
  await page.getByLabel('Done shows items accepted').selectOption({ label: 'in the last 30 days' });
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(12);

  // Hidden in the Backlog, they are still Done in the Overview's figures.
  const overview = await (await page.request.get(`/api/projects/${project}/overview`)).json();
  expect(overview.items.filter((i: { state: string }) => i.state === 'done')).toHaveLength(20);
});
