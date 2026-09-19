import { expect, test, type CDPSession, type Locator } from '@playwright/test';
import { signIn, taskModal } from './helpers.ts';

test.use({ hasTouch: true });

const centre = async (card: Locator) => {
  const box = (await card.boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  at?: { x: number; y: number },
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: at ? [{ x: at.x, y: at.y }] : [],
  });
}

test('on a phone a swipe over cards is left to scrolling, a hold picks a card up, and a tap opens it', async ({
  page,
}) => {
  await signIn(page, 'director');
  // A project with enough of the viewer's tasks to fill more than a phone's screen.
  const project = await (
    await page.request.post('/api/projects', { data: { name: 'Touch project' } })
  ).json();
  const me = await (await page.request.get('/api/me')).json();
  const base = `/api/projects/${project.id}`;
  const item = await (
    await page.request.post(`${base}/backlog`, { data: { title: 'Boss fight', category: 'must' } })
  ).json();
  for (const title of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'])
    await page.request.post(`${base}/backlog/${item.id}/tasks`, {
      data: { title, category: 'code', assigneeId: me.id },
    });

  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(`/projects/${project.id}/my-tasks`);
  const cards = page.getByTestId('my-task-card');
  await expect(cards).toHaveCount(8);
  await expect(cards.first()).toHaveClass(/draggable/);
  const cdp = await page.context().newCDPSession(page);

  // A finger moving over the cards scrolls the page: the browser decides that from the card's
  // touch-action, which used to be "none", so the cards swallowed every touch. (Whether a
  // synthesized swipe then scrolls depends on the platform's input pipeline, so the test holds
  // to what the browser is told.)
  expect(await cards.first().evaluate((card) => getComputedStyle(card).touchAction)).toBe(
    'manipulation',
  );
  // A quick swipe, shorter than the hold, picks nothing up and opens nothing.
  const swipeFrom = await centre(cards.nth(2));
  await touch(cdp, 'touchStart', swipeFrom);
  for (let step = 1; step <= 5; step++)
    await touch(cdp, 'touchMove', { x: swipeFrom.x, y: swipeFrom.y - step * 30 });
  await touch(cdp, 'touchEnd');
  await expect(cards).toHaveText([/One/, /Two/, /Three/, /Four/, /Five/, /Six/, /Seven/, /Eight/]);
  await expect(taskModal(page)).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // A short hold picks the card up; carried down over the cards below, it leaves the first
  // place. Each step waits for a frame, as a finger would give the page. How far down it lands
  // depends on how fast the machine measures, so only the move itself is asserted.
  const frame = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  const from = await centre(cards.nth(0));
  const to = await centre(cards.nth(2));
  await touch(cdp, 'touchStart', from);
  await page.waitForTimeout(400);
  for (let step = 1; step <= 8; step++) {
    await touch(cdp, 'touchMove', {
      x: from.x,
      y: Math.round(from.y + ((to.y - from.y) * step) / 8),
    });
    await frame();
  }
  await page.waitForTimeout(150);
  await touch(cdp, 'touchEnd');
  await expect(cards.first()).toContainText('Two');
  await expect(cards.filter({ hasText: 'One' })).toHaveCount(1);
  await expect(cards).toHaveCount(8);
  await expect(taskModal(page)).toHaveCount(0);
  // The order is the server's by now: a reload keeps it.
  await page.reload();
  await expect(cards.first()).toContainText('Two');

  // A tap is still a tap.
  await cards.nth(3).tap({ position: { x: 20, y: 12 } });
  await expect(taskModal(page).getByRole('heading', { name: 'Four' })).toBeVisible();
});
