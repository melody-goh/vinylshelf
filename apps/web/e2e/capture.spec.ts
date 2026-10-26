/**
 * Review captures of every shelf state at desktop and phone sizes, for the design
 * review (impeccable's inspection round). Run with `pnpm --filter @vinylshelf/web
 * e2e:capture`; images land in .impeccable/review/ (git-ignored).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  coverSvg,
  page as shelfPage,
  previews,
  release,
  searchResults,
  silentWav,
  user,
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
    return route.fulfill({ json: shelfPage() });
  });
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
  await page.goto('/');
  await settle(page);

  await page.getByRole('button', { name: 'Play a preview of Undertow' }).click({ timeout: 6000 });
  await page.waitForTimeout(1600);
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
});
