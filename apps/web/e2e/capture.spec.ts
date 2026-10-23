/**
 * Review captures of every shelf state at desktop and phone sizes, for the design
 * review (impeccable's inspection round). Run with `pnpm --filter @vinylshelf/web
 * e2e:capture`; images land in .impeccable/review/ (git-ignored).
 */
import { test, type Page } from '@playwright/test';
import { coverSvg, page as shelfPage, release, user } from './synthetic';

const OUT = '.impeccable/review';

type State = 'signed-out' | 'shelf' | 'empty' | 'refreshing';

async function mockApi(page: Page, state: State): Promise<void> {
  await page.route('https://i.discogs.com/**', (route) => {
    const index = Number(/cover-(\d+)/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: coverSvg(index),
    });
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
  await page.route('**/api/v1/releases/*', (route) => {
    const id = Number(route.request().url().split('/').pop());
    return route.fulfill({ json: release(id) });
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
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
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-chosen.png` });

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
});
