import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { placement } from '../components/Discover';
import { renderWithQueries } from '../test/render';
import {
  API,
  collectionItem,
  page,
  recommendations,
  releases,
  server,
  signedIn,
  tastePick,
} from '../test/server';

const READY = recommendations([
  {
    styles: ['Soul', 'Disco'],
    picks: [
      tastePick(1, { title: 'Rejoice', reason: 'Maurice White is on 4 of your records' }),
      tastePick(2, { title: 'Busy Body' }),
    ],
  },
  { styles: ['Smooth Jazz'], picks: [tastePick(3, { title: 'Next Exit' })] },
]);
let answer = READY;
let distances: string[];

beforeEach(() => {
  answer = READY;
  distances = [];
  server.use(
    ...signedIn(),
    ...releases(),
    http.get(`${API}/collection/items`, () =>
      HttpResponse.json(
        page({ totalItems: 1, items: [collectionItem(1, { title: 'Tidal Lines' })] }),
      ),
    ),
    http.get(`${API}/taste/recommendations`, ({ request }) => {
      distances.push(new URL(request.url).searchParams.get('distance') ?? '');
      return HttpResponse.json(answer);
    }),
  );
});

async function openDiscover() {
  const view = renderWithQueries(<App />);
  await view.user.click(await screen.findByRole('button', { name: 'Discover' }));
  return { ...view, region: await screen.findByRole('region', { name: 'Discover' }) };
}

describe('Discover', () => {
  it('shows the front pick with its reason, and moves along the row', async () => {
    const { user, region } = await openDiscover();

    expect(await within(region).findByRole('heading', { name: 'Rejoice' })).toBeInTheDocument();
    expect(within(region).getByText('Maurice White is on 4 of your records')).toBeInTheDocument();
    expect(within(region).getByText('Soul · Disco')).toBeInTheDocument();
    expect(within(region).getByText('1 / 3')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Next record' }));
    expect(within(region).getByRole('heading', { name: 'Busy Body' })).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(within(region).getByRole('heading', { name: 'Next Exit' })).toBeInTheDocument();
    // The room's name follows the row.
    expect(within(region).getByText('Smooth Jazz')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Next record' })).toBeDisabled();
  });

  it('asks for near picks first, and far ones when chosen', async () => {
    const { user, region } = await openDiscover();
    await within(region).findByRole('heading', { name: 'Rejoice' });

    await user.selectOptions(within(region).getByRole('combobox', { name: 'Reach' }), 'far');

    await waitFor(() => {
      expect(distances).toEqual(['near', 'far']);
    });
  });

  it('says plainly why there is nothing to show', async () => {
    answer = recommendations([], {
      status: 'too_few_records',
      basedOn: { shelfRecords: 4, inCatalogue: 2 },
    });
    const { region } = await openDiscover();
    expect(
      await within(region).findByText(/needs at least three of your records/),
    ).toHaveTextContent('It knows 2 so far.');
  });
});

describe('placement', () => {
  it('shrinks sleeves as they recede, keeps them on one line, and fades the far ones', () => {
    const front = placement(0, 400, 600);
    const behind = [1, 2, 3].map((d) => placement(-d, 400, 600));
    expect(front.scale).toBe(1);
    expect(behind.map((p) => p.scale)).toEqual([0.74, 0.74 ** 2, 0.74 ** 3]);
    // Further back is further left, and every bottom edge sits on the front one's.
    expect(behind.every((p, i) => p.x < (behind[i - 1]?.x ?? front.x))).toBe(true);
    for (const p of behind) expect(p.y + (400 * (1 + p.scale)) / 2).toBeCloseTo(400);
    expect(placement(-7, 400, 600).opacity).toBe(0);
  });
});
