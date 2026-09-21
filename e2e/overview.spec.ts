import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('the overview counts the project and maps every item by its tasks', async ({ page }) => {
  await signIn(page, 'director');
  await page.getByRole('link', { name: 'Demo project' }).click();
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Overview' })
    .click();
  const overview = page.getByTestId('overview');
  await expect(overview.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // The figures agree with what the API says about the project.
  const projectId = page.url().split('/projects/')[1]!.split('/')[0]!;
  const data = await (await page.request.get(`/api/projects/${projectId}/overview`)).json();
  const items: {
    title: string;
    category: string;
    tasks: { total: number; completed: number };
  }[] = data.items;
  // The map leaves out Won't Have items, which will not change.
  const mapped = items.filter((i) => i.category !== 'wont');
  const figures = overview.getByRole('region', { name: 'Figures' });
  await expect(figures.getByText('Backlog items').locator('..')).toContainText(
    String(items.length),
  );
  const total = items.reduce((n, i) => n + i.tasks.total, 0);
  const completed = items.reduce((n, i) => n + i.tasks.completed, 0);
  await expect(figures.getByText('Tasks complete').locator('..')).toContainText(
    `${completed} of ${total}`,
  );

  // Every item is on the map, each with an area proportional to its tasks (one if it has none).
  const cells = page.getByTestId('map-cell');
  await expect(cells).toHaveCount(mapped.length);
  const measured = await cells.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      return { tasks: Number(el.getAttribute('data-tasks')), area: box.width * box.height };
    }),
  );
  const perTask = measured.map((m) => m.area / Math.max(1, m.tasks)).sort((a, b) => a - b);
  const median = perTask[Math.floor(perTask.length / 2)]!;
  // The gaps between fields take a little more from small ones; the rest is proportion.
  for (const value of perTask) expect(value / median).toBeGreaterThan(0.75);
  for (const value of perTask) expect(value / median).toBeLessThan(1.25);

  // A field says what it is on hover, and opens its item's breakdown.
  const first = mapped.find((i) => i.tasks.total > 0)!;
  const cell = cells.filter({ has: page.getByText(first.title, { exact: true }) });
  await cell.hover();
  await expect(page.getByTestId('map-tooltip')).toContainText(first.title);
  await expect(page.getByTestId('map-tooltip')).toContainText(
    `${first.tasks.completed} of ${first.tasks.total} complete`,
  );
  // The same, without a map: a table of every item.
  await overview.getByText('Show the map as a table').click();
  await expect(overview.locator('.map-table tbody tr')).toHaveCount(mapped.length);

  await cell.click();
  await expect(page).toHaveURL(/\/breakdown\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
});

test('the map sets accepted items apart and leaves Won’t Have ones out', async ({ page }) => {
  await signIn(page, 'director');
  const post = async (url: string, data: object = {}) =>
    (await page.request.post(`/api${url}`, { data })).json();
  const project = (await post('/projects', { name: 'Map project' })).id;
  const item = async (title: string, category: string, tasks: number) => {
    const id = (await post(`/projects/${project}/backlog`, { title, category })).id;
    const ids: string[] = [];
    for (let n = 1; n <= tasks; n++)
      ids.push(
        (
          await post(`/projects/${project}/backlog/${id}/tasks`, {
            title: `${title} ${n}`,
            category: 'code',
          })
        ).id,
      );
    return { id, tasks: ids };
  };
  await item('Grapple', 'must', 3);
  await item('Rope swing', 'should', 2);
  const photo = await item('Photo mode', 'could', 2);
  await item('Multiplayer', 'wont', 4);
  for (const task of photo.tasks) await post(`/projects/${project}/tasks/${task}/complete`);
  await post(`/projects/${project}/backlog/${photo.id}/accept`);

  await page.goto(`/projects/${project}/overview`);
  const map = page.getByTestId('project-map');
  const cells = map.getByTestId('map-cell');
  await expect(cells).toHaveCount(3);
  await expect(cells.filter({ hasText: 'Multiplayer' })).toHaveCount(0);
  // The Won't Have item still counts among the figures.
  await expect(page.getByTestId('priority-wont')).toContainText('1 item');

  // The accepted item takes the colour of Done, in a part of its own after the open work.
  const accepted = cells.filter({ hasText: 'Photo mode' });
  await expect(accepted).toHaveClass(/\bhue-done\b/);
  await expect(accepted).toContainText('✓');
  const boxes = await cells.evaluateAll((els) =>
    els.map((el) => ({
      done: el.classList.contains('hue-done'),
      box: el.getBoundingClientRect().toJSON() as DOMRect,
    })),
  );
  const done = boxes.find((b) => b.done)!.box;
  for (const { box } of boxes.filter((b) => !b.done))
    expect(box.right <= done.left - 10 || box.bottom <= done.top - 10).toBe(true);
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText(
    'Accepted as Done 2 tasks',
  );
});
