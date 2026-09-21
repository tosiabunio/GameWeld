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
  const items: { title: string; tasks: { total: number; completed: number } }[] = data.items;
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
  await expect(cells).toHaveCount(items.length);
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
  const first = items.find((i) => i.tasks.total > 0)!;
  const cell = cells.filter({ has: page.getByText(first.title, { exact: true }) });
  await cell.hover();
  await expect(page.getByTestId('map-tooltip')).toContainText(first.title);
  await expect(page.getByTestId('map-tooltip')).toContainText(
    `${first.tasks.completed} of ${first.tasks.total} complete`,
  );
  // The same, without a map: a table of every item.
  await overview.getByText('Show the map as a table').click();
  await expect(overview.locator('.map-table tbody tr')).toHaveCount(items.length);

  await cell.click();
  await expect(page).toHaveURL(/\/breakdown\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
});
