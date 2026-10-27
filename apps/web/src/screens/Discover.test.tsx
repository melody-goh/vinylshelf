import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { featuredTrack, placement } from '../components/Discover';
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
  wantlistItem,
} from '../test/server';

const READY = recommendations([
  {
    styles: ['Soul', 'Disco'],
    picks: [
      tastePick(1, {
        title: 'Rejoice',
        link: "Produced by Maurice White, who's on 4 of your records",
      }),
      tastePick(2, { title: 'Busy Body', link: null }),
    ],
  },
  { styles: ['Smooth Jazz'], picks: [tastePick(3, { title: 'Next Exit' })] },
]);
let answer = READY;
let distances: string[];
/** Requests that changed something, as "METHOD path body". */
let writes: string[];

beforeEach(() => {
  answer = READY;
  distances = [];
  writes = [];
  server.use(
    http.post(`${API}/taste/feedback`, async ({ request }) => {
      writes.push(`POST /taste/feedback ${JSON.stringify(await request.json())}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/taste/feedback/:id`, ({ params }) => {
      writes.push(`DELETE /taste/feedback/${String(params.id)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${API}/wantlist/:id`, ({ params }) => {
      writes.push(`PUT /wantlist/${String(params.id)}`);
      return HttpResponse.json(wantlistItem(Number(params.id)));
    }),
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
    expect(within(region).getByText("Soul and Disco, late '70s")).toBeInTheDocument();
    expect(within(region).getByText('Earth, Wind & Fire')).toBeInTheDocument();
    expect(
      within(region).getByText("Produced by Maurice White, who's on 4 of your records"),
    ).toBeInTheDocument();
    expect(within(region).getByText('Soul · Disco')).toBeInTheDocument();
    expect(within(region).getByText('1 / 3')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Next record' }));
    expect(within(region).getByRole('heading', { name: 'Busy Body' })).toBeInTheDocument();
    // No link to the shelf: no Link row, rather than a made-up one.
    expect(within(region).queryByText('Link')).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(within(region).getByRole('heading', { name: 'Next Exit' })).toBeInTheDocument();
    // The room's name follows the row.
    expect(within(region).getByText('Smooth Jazz')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Next record' })).toBeDisabled();
  });

  it("plays the record's one track on the page, and opens the whole record", async () => {
    const { user, region } = await openDiscover();
    await within(region).findByRole('heading', { name: 'Rejoice' });

    // The fixture release has no title track, so its opening track is chosen.
    const play = await within(region).findByRole(
      'button',
      { name: 'Play Shoreline' },
      { timeout: 4000 },
    );
    await user.click(play);
    expect(
      await within(region).findByRole('button', { name: 'Pause Shoreline' }),
    ).toBeInTheDocument();

    // Playing one switches autoplay on; pausing switches it off.
    expect(within(region).getByRole('combobox', { name: 'Autoplay' })).toHaveValue('on');
    await user.click(within(region).getByRole('button', { name: 'Pause Shoreline' }));
    expect(within(region).getByRole('combobox', { name: 'Autoplay' })).toHaveValue('off');

    await user.click(within(region).getByRole('button', { name: 'Full album' }));
    expect(await screen.findByRole('dialog', { name: /^Listening Room/ })).toBeInTheDocument();
  });

  it('wants a record, and steers the picks with more like this and not for me', async () => {
    const { user, region } = await openDiscover();
    await within(region).findByRole('heading', { name: 'Rejoice' });

    await user.click(within(region).getByRole('button', { name: 'Want' }));
    expect(await within(region).findByRole('button', { name: 'Wanted' })).toBeDisabled();

    const more = within(region).getByRole('button', { name: 'More like this' });
    await user.click(more);
    expect(more).toHaveAttribute('aria-pressed', 'true');
    await user.click(more);
    expect(more).toHaveAttribute('aria-pressed', 'false');

    // Not for me: the record leaves the row and the next one comes to the front.
    await user.click(within(region).getByRole('button', { name: 'Not for me' }));
    expect(await within(region).findByRole('heading', { name: 'Busy Body' })).toBeInTheDocument();
    expect(within(region).getByText('1 / 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(writes).toEqual([
        'PUT /wantlist/9000001',
        'POST /taste/feedback {"masterId":1,"verdict":"more"}',
        'DELETE /taste/feedback/1',
        'POST /taste/feedback {"masterId":1,"verdict":"less"}',
      ]);
    });
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
      basedOn: { shelfRecords: 4, inCatalogue: 2, wanted: 0 },
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

describe('featuredTrack', () => {
  const track = (title: string, position: string) => ({ title, position, previewUrl: 'x' });

  it('prefers the title track, however it is dressed up', () => {
    expect(
      featuredTrack({ title: 'Rejoice' }, [
        track('Key To My Heart', 'A1'),
        track('Rejoice (Remastered)', 'B2'),
      ]),
    ).toEqual({ track: track('Rejoice (Remastered)', 'B2'), why: 'title' });
  });

  it('otherwise opens where the record opens, and has nothing without previews', () => {
    expect(
      featuredTrack({ title: 'Suddenly' }, [track('Lovin You', 'A1'), track('Hiding Place', 'A2')]),
    ).toEqual({
      track: track('Lovin You', 'A1'),
      why: 'opening',
    });
    expect(featuredTrack({ title: 'Suddenly' }, [])).toBeNull();
  });
});
