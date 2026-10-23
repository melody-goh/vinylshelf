import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { discogsFixtures, discogsHandlers, discogsUrls } from '../test/discogs-handlers.js';
import { mswServer } from '../test/msw.js';
import { checkFixtureShapes, shapeOf } from './fixture-check.js';

const options = {
  consumer: { key: 'ckey', secret: 'csecret' },
  userAgent: 'VinylShelfTest/0.0',
  accessToken: { token: 't', secret: 's' },
  username: 'fixture_collector',
  fixturesDir: new URL('../test/fixtures/discogs/', import.meta.url),
};

describe('shapeOf', () => {
  it('describes structure without any values', () => {
    const shape = [...shapeOf({ a: 1, b: [{ c: 'secret value', d: null }] })];
    expect(shape).toEqual([
      '(root): object',
      'a: number',
      'b: array',
      'b[]: object',
      'b[].c: string',
      'b[].d: null',
    ]);
    expect(shape.join()).not.toContain('secret value');
  });
});

describe('checkFixtureShapes', () => {
  it('reports no drift when the live API matches the fixtures', async () => {
    mswServer.use(...discogsHandlers());
    const reports = await checkFixtureShapes(options);
    for (const report of reports) {
      expect(report).toMatchObject({ missingFromFixture: [], schemaIssues: [] });
    }
  });

  it('reports new fields, missing fields and schema breakage by path only', async () => {
    const live = discogsFixtures.collectionPage(1);
    const first = live.releases[0] as Record<string, unknown> & {
      basic_information: Record<string, unknown>;
    };
    first.notes = [{ field_id: 1, value: 'private note' }];
    delete first.basic_information.year;
    // MSW uses the first matching handler, so the drifted response goes first.
    mswServer.use(
      http.get(discogsUrls.collection, () => HttpResponse.json(live)),
      ...discogsHandlers(),
    );

    const [, collection] = await checkFixtureShapes(options);

    expect(collection?.missingFromFixture).toEqual([
      'releases[].notes: array',
      'releases[].notes[]: object',
      'releases[].notes[].field_id: number',
      'releases[].notes[].value: string',
    ]);
    expect(collection?.schemaIssues.join()).toContain('releases.0.basic_information.year');
    expect(JSON.stringify(collection)).not.toContain('private note');
  });
});
