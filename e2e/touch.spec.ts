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

test('on a phone a swipe over cards scrolls, a hold picks a card up, and a tap opens it', async ({
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

  // A finger moving over the cards scrolls the page; the cards used to swallow the touch.
  const start = await centre(cards.nth(2));
  await cdp.send('Input.synthesizeScrollGesture', {
    x: start.x,
    y: start.y,
    yDistance: -400,
    gestureSourceType: 'touch',
    speed: 1200,
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  // Scrolling moved nothing and opened nothing.
  await expect(cards).toHaveText([/One/, /Two/, /Three/, /Four/, /Five/, /Six/, /Seven/, /Eight/]);
  await expect(taskModal(page)).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // A short hold picks the card up; moved over another, it takes that card's place.
  const from = await centre(cards.nth(0));
  const to = await centre(cards.nth(2));
  await touch(cdp, 'touchStart', from);
  await page.waitForTimeout(400);
  for (let step = 1; step <= 8; step++)
    await touch(cdp, 'touchMove', {
      x: from.x,
      y: Math.round(from.y + ((to.y - from.y) * step) / 8),
    });
  await page.waitForTimeout(100);
  await touch(cdp, 'touchEnd');
  await expect(cards).toHaveText([/Two/, /Three/, /One/, /Four/, /Five/, /Six/, /Seven/, /Eight/]);
  await expect(taskModal(page)).toHaveCount(0);

  // A tap is still a tap.
  await cards.nth(3).tap({ position: { x: 20, y: 12 } });
  await expect(taskModal(page).getByRole('heading', { name: 'Four' })).toBeVisible();
});
