/**
 * A synthetic catalogue for the offline evaluation (ADR 0008 §3): never real users'
 * collections. It models how collections actually grow:
 *
 * - **Scenes** share a genre, styles and an era. Styles alone identify a scene, so
 *   matching styles finds the right scene but cannot tell records within it apart.
 * - **Circles** within a scene share a label and core people: a label's roster, a
 *   producer's sessions, a group of players. Collectors follow circles, so test shelves
 *   are drawn from circles, and the held-out answers come from the same circles. Records
 *   from the rest of the scene are the distractors: right styles, wrong circle.
 * - **Noise:** unrelated, often very popular records, so recommending the most-pressed
 *   records cannot pass for taste.
 *
 * An earlier version had scenes without circles; style matching alone then reached the
 * ceiling, so the test could not tell a recommender from a genre filter (ADR 0008, Notes).
 *
 * Everything is seeded: the same seed gives the same catalogue and shelves, so a score
 * change means the engine changed.
 */
import { describeMaster } from '../../catalogue/describe.js';
import type { CatalogueMaster, CatalogueRow } from '../../catalogue/model.js';
import type { Embedder } from '../embedder.js';

export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// prettier-ignore
const SYLLABLES = ['ka', 'lo', 'mi', 'ren', 'to', 'vas', 'ne', 'qui', 'dor', 'sa', 'bel', 'un', 'fio', 'zan', 'pe', 'rah', 'ti', 'mos', 'gal', 've'];
// prettier-ignore
const GENRES = ['Jazz', 'Electronic', 'Rock', 'Funk / Soul', 'Folk, World, & Country', 'Classical', 'Hip Hop', 'Latin'];
// prettier-ignore
const ROLES = ['Producer', 'Engineer', 'Arranged By', 'Mixed By', 'Bass', 'Drums', 'Piano', 'Guitar', 'Saxophone'];

function word(random: () => number, syllables = 2): string {
  let w = '';
  for (let i = 0; i < syllables; i++) {
    w += SYLLABLES[Math.floor(random() * SYLLABLES.length)] ?? 'a';
  }
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

/** A record's version count: most records are pressed a few times, a few hundreds. */
function versions(random: () => number): number {
  const normal = Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());
  return Math.max(1, Math.round(Math.exp(1.4 + 1.1 * normal)));
}

export interface SyntheticWorld {
  catalogue: CatalogueRow[];
  /** "scene/circle" of each master; noise records are "noise". */
  circleOf: Map<number, string>;
  scenes: number;
  circlesPerScene: number;
}

export interface WorldOptions {
  seed: number;
  scenes: number;
  circlesPerScene: number;
  perCircle: number;
  noise: number;
}

interface Circle {
  label: string;
  people: string[];
}

interface Scene {
  genre: string;
  styles: string[];
  decade: number;
  /** People who play across the scene, beyond any one circle. */
  people: string[];
  circles: Circle[];
}

export async function syntheticWorld(
  options: WorldOptions,
  embedder: Embedder,
): Promise<SyntheticWorld> {
  const random = seeded(options.seed);
  const person = () => `${word(random, 2)} ${word(random, 3)}`;
  const styleWords = Array.from({ length: options.scenes * 3 + 10 }, () => word(random, 2));
  const scenes: Scene[] = Array.from({ length: options.scenes }, (_, s) => ({
    genre: pick(random, GENRES),
    styles: styleWords.slice(s * 3, s * 3 + 3),
    decade: 1950 + Math.floor(random() * 7) * 10,
    people: Array.from({ length: 6 }, person),
    circles: Array.from({ length: options.circlesPerScene }, () => ({
      label: word(random, 2),
      people: Array.from({ length: 4 }, person),
    })),
  }));

  let id = 1;
  const record = (scene: Scene | null, circle: Circle | null): CatalogueMaster => {
    const styles =
      scene === null
        ? [pick(random, styleWords), pick(random, styleWords)]
        : [
            pick(random, scene.styles),
            pick(random, scene.styles),
            ...(random() < 0.3 ? [pick(random, styleWords)] : []),
          ];
    const people =
      scene && circle
        ? [
            pick(random, circle.people),
            pick(random, circle.people),
            pick(random, scene.people),
            person(),
          ]
        : [person(), person()];
    const masterId = id++;
    return {
      id: masterId,
      mainReleaseId: masterId * 10,
      title: `${word(random, 2)} ${word(random, 2)}`,
      artists: [`${word(random, 2)} ${word(random, 2)}`],
      year: scene ? scene.decade + Math.floor(random() * 10) : 1950 + Math.floor(random() * 70),
      genres: [scene ? scene.genre : pick(random, GENRES)],
      styles: [...new Set(styles)],
      kind: 'album',
      // Most of a circle's records are on its label; some are licensed elsewhere.
      labels: [circle && random() < 0.8 ? circle.label : word(random, 2)],
      country: null,
      credits: [...new Set(people)].map((name) => ({ name, role: pick(random, ROLES) })),
      // Noise records skew popular, so popularity alone is a weak strategy.
      versions: scene ? versions(random) : versions(random) * 4,
      vinylVersions: 1,
    };
  };

  const masters: CatalogueMaster[] = [];
  const circleOf = new Map<number, string>();
  scenes.forEach((scene, s) => {
    scene.circles.forEach((circle, c) => {
      for (let i = 0; i < options.perCircle; i++) {
        const master = record(scene, circle);
        masters.push(master);
        circleOf.set(master.id, `${String(s)}/${String(c)}`);
      }
    });
  });
  for (let i = 0; i < options.noise; i++) {
    const master = record(null, null);
    masters.push(master);
    circleOf.set(master.id, 'noise');
  }

  const vectors = await embedder.embed(masters.map((m) => describeMaster(m)));
  return {
    catalogue: masters.map((m, i) => ({
      ...m,
      embedding: vectors[i] ?? new Float32Array(embedder.model.dims),
    })),
    circleOf,
    scenes: options.scenes,
    circlesPerScene: options.circlesPerScene,
  };
}

export interface EvalShelf {
  /** What the user owns, as the engine sees it. */
  shelf: CatalogueRow[];
  /** Held out: records from the shelf's own circles that a good engine should find. */
  heldOut: CatalogueRow[];
}

/**
 * Shelves following one to three circles, each from a different scene, plus a stray
 * record or two; a quarter of each circle's records on the shelf are held out as the
 * answers.
 */
export function syntheticShelves(world: SyntheticWorld, count: number, seed: number): EvalShelf[] {
  const random = seeded(seed);
  const byCircle = new Map<string, CatalogueRow[]>();
  for (const row of world.catalogue) {
    const circle = world.circleOf.get(row.id) ?? 'noise';
    byCircle.set(circle, [...(byCircle.get(circle) ?? []), row]);
  }
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };

  return Array.from({ length: count }, () => {
    const sceneCount = 1 + Math.floor(random() * 3);
    const scenes = shuffle(Array.from({ length: world.scenes }, (_, i) => i)).slice(0, sceneCount);
    const shelf: CatalogueRow[] = [];
    const heldOut: CatalogueRow[] = [];
    for (const scene of scenes) {
      const circle = `${String(scene)}/${String(Math.floor(random() * world.circlesPerScene))}`;
      const taken = shuffle(byCircle.get(circle) ?? []).slice(0, 10 + Math.floor(random() * 8));
      const cut = Math.max(1, Math.round(taken.length / 4));
      heldOut.push(...taken.slice(0, cut));
      shelf.push(...taken.slice(cut));
    }
    shelf.push(...shuffle(byCircle.get('noise') ?? []).slice(0, 2));
    return { shelf, heldOut };
  });
}
