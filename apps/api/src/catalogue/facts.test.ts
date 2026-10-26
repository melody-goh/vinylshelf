import { createReadStream } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { masterFacts } from './masters.js';
import { releaseFacts, splitRoles } from './releases.js';
import { streamElements, type XmlNode } from './xml.js';

const fixture = (name: string) =>
  createReadStream(new URL(`../test/fixtures/discogs-dumps/${name}`, import.meta.url));

async function elements(file: string, name: string): Promise<XmlNode[]> {
  const found: XmlNode[] = [];
  await streamElements(fixture(file), name, (node) => {
    found.push(node);
  });
  return found;
}

describe('releaseFacts', () => {
  it('reads master, vinyl, labels, country and every credit, release and track level', async () => {
    const [first] = await elements('releases.xml', 'release');
    if (!first) throw new Error('no release');
    expect(releaseFacts(first)).toEqual({
      masterId: 100,
      isMainRelease: true,
      isVinyl: true,
      labels: ['Columbia'],
      country: 'US',
      credits: [
        { name: 'Teo Macero', role: 'Producer' },
        { name: 'Fred Plaut', role: 'Engineer' },
        { name: 'Studio Design Co.', role: 'Design' },
        { name: 'John Coltrane', role: 'Tenor Saxophone' },
        // Discogs' "(3)" disambiguation is not part of anyone's name.
        { name: 'Bill Evans', role: 'Piano' },
      ],
    });
  });

  it('counts a box set with an LP in it as vinyl, and a release with no master as none', async () => {
    const releases = await elements('releases.xml', 'release');
    const facts = releases.map(releaseFacts);
    expect(facts.find((f) => f.masterId === 400 && f.isMainRelease)?.isVinyl).toBe(true);
    expect(facts.filter((f) => f.masterId === 0)).toHaveLength(1);
  });
});

describe('masterFacts', () => {
  it('reads the album as people know it, with unknown years as null', async () => {
    const facts = (await elements('masters.xml', 'master')).map(masterFacts);
    expect(facts[0]).toEqual({
      id: 100,
      mainReleaseId: 1,
      title: 'Kind of Blue',
      artists: ['Miles Davis'],
      year: 1959,
      genres: ['Jazz'],
      styles: ['Modal', 'Hard Bop'],
    });
    expect(facts.find((f) => f.id === 400)).toMatchObject({ artists: ['Los Señores'], year: null });
  });
});

describe('splitRoles', () => {
  it("splits packed roles, but not the commas inside a role's own detail", () => {
    expect(splitRoles('Producer, Written-By')).toEqual(['Producer', 'Written-By']);
    expect(splitRoles('Engineer [Recording, Mixing], Producer')).toEqual([
      'Engineer [Recording, Mixing]',
      'Producer',
    ]);
    expect(splitRoles('')).toEqual([]);
  });
});
