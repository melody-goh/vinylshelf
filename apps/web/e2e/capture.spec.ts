/**
 * Review captures of every shelf state at desktop and phone sizes, for the design
 * review (impeccable's inspection round). Run with `pnpm --filter @vinylshelf/web
 * e2e:capture`; images land in .impeccable/review/ (git-ignored).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  coverSvg,
  facets,
  libraryPage,
  page as shelfPage,
  previews,
  recommendations,
  release,
  searchResults,
  silentWav,
  user,
  wantlist,
} from './synthetic';

const OUT = '.impeccable/review';

type State = 'signed-out' | 'shelf' | 'empty' | 'refreshing';

async function mockApi(page: Page, state: State): Promise<void> {
  await page.route('https://i.discogs.com/**', async (route) => {
    // Like i.discogs.com (checked 2026-10-23, with and without Origin): no CORS header.
    // A fulfilled route would slip past the browser's CORS check, so fail CORS-mode
    // loads (the only image requests that send Origin) outright; the gatefold board then
    // falls back to carbon, as it does live.
    const headers = await route.request().allHeaders();
    if (headers.origin) return route.abort();
    const index = Number(/cover-(\d+)/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({ contentType: 'image/svg+xml', body: coverSvg(index) });
  });
  await page.route('**/api/v1/me', (route) =>
    state === 'signed-out'
      ? route.fulfill({
          status: 401,
          json: { type: '/problems/unauthenticated', title: 'Sign in required', status: 401 },
        })
      : route.fulfill({ json: user }),
  );
  await page.route('**/api/v1/collection/items**', (route) => {
    if (state === 'empty') return route.fulfill({ json: shelfPage({ items: [], totalItems: 0 }) });
    if (state === 'refreshing') {
      return route.fulfill({
        json: shelfPage({
          items: shelfPage().items.slice(0, 5),
          refresh: {
            status: 'refreshing',
            importId: '0b6c2e9e-5d0f-4d4f-8a52-7f5e2f5f1c11',
            hiddenCount: 7,
            retryAt: null,
          },
        }),
      });
    }
    if (new URL(route.request().url()).searchParams.get('limit') === '100') {
      return route.fulfill({ json: libraryPage() });
    }
    return route.fulfill({ json: shelfPage() });
  });
  await page.route('**/api/v1/collection/facets', (route) => route.fulfill({ json: facets() }));
  await page.route('**/api/v1/wantlist**', (route) => route.fulfill({ json: wantlist() }));
  await page.route('**/api/v1/collection/imports/**', (route) =>
    route.fulfill({
      json: {
        id: '0b6c2e9e-5d0f-4d4f-8a52-7f5e2f5f1c11',
        status: 'running',
        progress: { fetched: 120, total: 312 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route('**/api/v1/releases/*/previews', (route) => {
    const id = Number(route.request().url().split('/').at(-2));
    return route.fulfill({ json: previews(id) });
  });
  await page.route('https://audio.example/**', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: silentWav() }),
  );
  await page.route('**/api/v1/taste/recommendations**', (route) =>
    route.fulfill({ json: recommendations() }),
  );
  await page.route('**/api/v1/search/releases**', (route) =>
    route.fulfill({ json: searchResults() }),
  );
  await page.route('**/api/v1/releases/*', (route) => {
    const id = Number(route.request().url().split('/').pop());
    return route.fulfill({ json: release(id) });
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // The first screen holds for one pass of its scored type before the app appears.
  await expect(page.getByText('Waking up the shelf…', { exact: true })).toHaveCount(0, {
    timeout: 8000,
  });
  await page.waitForTimeout(900); // springs and the ticking count come to rest
}

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

test('desktop captures', async ({ page }) => {
  await page.setViewportSize(desktop);

  await mockApi(page, 'signed-out');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-login.png` });

  await page.unrouteAll();
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true });

  // A real pointer lands on a disc's visible crescent, below the disc that covers it.
  const disc = page.getByRole('button', { name: /^Small Hours/ });
  const box = await disc.boundingBox();
  const crescent = { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) - 14 };
  await disc.hover({ position: crescent });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/desktop-hover.png` });

  await disc.click({ position: crescent });
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${OUT}/desktop-folding.png` });
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-chosen.png` });

  await page.getByRole('searchbox', { name: /search discogs/i }).fill('paper moons');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/desktop-search.png` });
  await page.getByRole('searchbox', { name: /search discogs/i }).fill('');

  await page.unrouteAll();
  await mockApi(page, 'empty');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-empty.png` });

  await page.unrouteAll();
  await mockApi(page, 'refreshing');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-refreshing.png` });
});

test('phone captures', async ({ page }) => {
  await page.setViewportSize(phone);

  await mockApi(page, 'signed-out');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile-login.png`, fullPage: true });

  await page.unrouteAll();
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });

  await page.getByRole('searchbox', { name: /search discogs/i }).fill('paper moons');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/mobile-search.png` });
  await page.getByRole('searchbox', { name: /search discogs/i }).fill('');
  await page.waitForTimeout(400);

  // Keyboard focus leans a disc out and names it under the row.
  await page.getByRole('button', { name: /^Orchard Weather/ }).focus();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/mobile-leaning.png` });
});

test('loading captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  // Hold the session check open so the first loading screen stays up.
  await page.route('**/api/v1/me', () => new Promise<void>(() => undefined));
  await page.goto('/');
  await page.getByRole('status').waitFor();
  for (const at of [500, 800, 1100]) {
    await page.waitForTimeout(at === 500 ? 500 : 300);
    await page.screenshot({ path: `${OUT}/desktop-loading-${String(at)}.png` });
  }
  const text = page.getByRole('status');
  await text.screenshot({ path: `${OUT}/desktop-loading-detail.png` });

  await page.setViewportSize(phone);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/mobile-loading.png` });
});

test('listening room captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  // A shelf of 120, so the stack's per-disc z-indexes climb well past the room's.
  await page.route('**/api/v1/collection/items**', (route) => {
    const base = shelfPage();
    const items = Array.from({ length: 10 }, (_, copy) =>
      base.items.map((item) => ({ ...item, instanceId: item.instanceId + copy * 1000 })),
    ).flat();
    return route.fulfill({ json: shelfPage({ items, totalItems: items.length }) });
  });
  await page.goto('/');
  await settle(page);

  await page.getByRole('button', { name: 'Play a preview of Undertow' }).click({ timeout: 6000 });
  // The disc's way in, from the sleeve to the platter.
  for (const at of [60, 200, 380, 600, 900]) {
    await page.waitForTimeout(at === 60 ? 60 : 160);
    await page.screenshot({ path: `${OUT}/desktop-listening-in-${String(at)}.png` });
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/desktop-listening.png` });

  // Cue by hand: drag the cursor across the ruler and hold mid-drag.
  const ruler = page.getByRole('slider', { name: 'Position in the record' });
  const box = await ruler.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2, { steps: 12 });
    await page.screenshot({ path: `${OUT}/desktop-listening-scrub.png` });
    await page.mouse.up();
  }

  await page.setViewportSize(phone);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/mobile-listening.png` });

  // And back into the sleeve.
  await page.setViewportSize(desktop);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  for (const at of [150, 450]) {
    await page.waitForTimeout(at === 150 ? 150 : 300);
    await page.screenshot({ path: `${OUT}/desktop-listening-out-${String(at)}.png` });
  }
});

test('library captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);

  await page.getByRole('button', { name: 'Library' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/desktop-library-arriving.png` });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/desktop-library.png` });

  await page
    .getByRole('button', { name: /^Small Hours/ })
    .first()
    .hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/desktop-library-hover.png` });

  await page.getByRole('combobox', { name: 'Genre' }).selectOption('Jazz');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/desktop-library-filtered.png` });

  await page.setViewportSize(phone);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/mobile-library.png` });
});

test('wantlist captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);

  await page.getByRole('button', { name: 'Wantlist' }).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /^Orchard Weather/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/desktop-wantlist-chosen.png` });

  await page.setViewportSize(phone);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/mobile-wantlist-chosen.png` });
});

test('liquid button captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);

  // Pull at the lower edge of Sync, just past it, and catch the liquid mid-stretch.
  const sync = page.getByRole('button', { name: 'Sync with Discogs' });
  const box = await sync.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(400);
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height + 12, { steps: 6 });
    await page.waitForTimeout(90);
    await page.screenshot({
      path: `${OUT}/liquid-sync.png`,
      clip: { x: box.x - 60, y: box.y - 30, width: box.width + 120, height: box.height + 70 },
    });
  }

  await page.getByRole('button', { name: 'Wantlist' }).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /^Orchard Weather/ }).click();
  const acquired = page.getByRole('button', { name: 'Acquired' });
  const a = await acquired.boundingBox();
  if (a) {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.waitForTimeout(300);
    await page.mouse.move(a.x + a.width * 0.2, a.y - 10, { steps: 6 });
    await page.waitForTimeout(90);
    await page.screenshot({
      path: `${OUT}/liquid-acquired.png`,
      clip: { x: a.x - 200, y: a.y - 40, width: a.width + 320, height: a.height + 80 },
    });
  }
});

test('tab captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);
  const header = { x: 0, y: 0, width: 520, height: 56 };
  await page.screenshot({ path: `${OUT}/desktop-tabs.png`, clip: header });
  // Record the dot's x for 30 frames after the click, to see it travel.
  const track = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const xs: number[] = [];
        const tick = () => {
          const dot = document.querySelector('nav[aria-label="Views"] span[aria-hidden]');
          xs.push(Math.round(dot?.getBoundingClientRect().x ?? -1));
          if (xs.length < 30) requestAnimationFrame(tick);
          else resolve(xs);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByRole('button', { name: 'Wantlist' }).click();
  console.log('dot x by frame:', (await track).join(' '));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/desktop-tabs-wantlist.png`, clip: header });
});

test('library scroll captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.route('**/api/v1/collection/items**', (route) =>
    route.fulfill({ json: libraryPage(180) }),
  );
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Library' }).click();
  await page.waitForTimeout(2200);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/desktop-library-scrolling.png` });
  await page.waitForTimeout(900);
  // Park the pointer on the readout so no cover is hovered.
  await page.mouse.move(720, 880);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-library-scrolled.png` });
});

test('discover captures', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Discover' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/desktop-discover-loading.png` });
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/desktop-discover.png` });
  // One track plays on the page; its disc slides out of the sleeve and turns.
  await page.getByRole('button', { name: /^Play / }).click({ timeout: 6000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/desktop-discover-playing.png` });
  // The whole record opens in the Listening Room.
  await page.getByRole('button', { name: 'Full album' }).click();
  for (const at of [100, 400, 800]) {
    await page.waitForTimeout(at === 100 ? 100 : at === 400 ? 300 : 400);
    await page.screenshot({ path: `${OUT}/desktop-discover-listen-${String(at)}.png` });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/desktop-discover-moving.png` });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/desktop-discover-4.png` });
  await page.setViewportSize(phone);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/mobile-discover.png` });
});

/** Frame gaps (ms) over the next `ms`, to spot dropped frames in a transition. */
async function frameGaps(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (duration) =>
      new Promise<number[]>((resolve) => {
        const gaps: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          gaps.push(Math.round(now - last));
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve(gaps);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test('listening room smoothness', async ({ page }) => {
  await page.setViewportSize(desktop);
  await mockApi(page, 'shelf');
  await page.goto('/');
  await settle(page);
  const report = (name: string, gaps: number[]) => {
    const sorted = [...gaps].sort((a, b) => a - b);
    console.log(
      name,
      `frames ${String(gaps.length)}, median ${String(sorted[Math.floor(sorted.length / 2)])}ms, worst ${String(sorted.at(-1))}ms, over 34ms: ${String(gaps.filter((g) => g > 34).length)}`,
    );
  };
  await page.getByRole('button', { name: 'Play a preview of Undertow' }).click({ timeout: 6000 });
  const opening = frameGaps(page, 1800);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/desktop-listening-mid.png` });
  report('gatefold open', await opening);
  const closing = frameGaps(page, 1500);
  await page.keyboard.press('Escape');
  report('gatefold close', await closing);
});
