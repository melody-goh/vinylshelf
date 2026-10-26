/**
 * Turns Discogs' named colourways ("Blue Marbled", "Clear w/ Black Splatter") into a
 * disc surface. Only what Discogs names is drawn: no name means standard black, never a
 * guessed colour (PRODUCT.md: evidence; contract: ReleaseSummary.vinylColors).
 */

const LACQUER = '#121212';
const PAPER_WHITE = '#efeee9';

// prettier-ignore
const SWATCHES: Record<string, string> = {
  black: '#121212', white: '#efeee9', grey: '#8c8b88', gray: '#8c8b88', silver: '#b9bcc0',
  gold: '#c9a23a', red: '#c9312c', crimson: '#a3202c', maroon: '#6e1f2a', pink: '#e98aa8',
  magenta: '#c2307f', purple: '#6a3d9a', violet: '#7a4fc4', lavender: '#b9a6dd',
  blue: '#2457b8', navy: '#1c2f5e', teal: '#167a7a', turquoise: '#2bb3b1', aqua: '#4fc6d1',
  cyan: '#33b8d9', green: '#2f8a4c', olive: '#6b6f2a', mint: '#9fd9bf', yellow: '#efc12f',
  mustard: '#c99a26', orange: '#e7702a', amber: '#d98a1f', brown: '#6a4228',
  bronze: '#8c5e2a', copper: '#b06a3b', tan: '#c49a6c', beige: '#d9c9a8', cream: '#ece3cc',
  bone: '#e4ddcc', ivory: '#ece7d6',
};

const CLEAR_WORDS = ['clear', 'transparent', 'translucent'];
const CLEAR_BASE = '#d8dde0';

export interface DiscSurface {
  /** The vinyl's own colour. */
  base: string;
  /** Clear vinyl: the base is drawn through the clear plate, so the ground shows. */
  clear: boolean;
  /** A second colour pressed into the first, drawn through the matching plate. */
  effect: { kind: 'marble' | 'splatter'; colour: string } | null;
  /** The colourway as Discogs names it, or null when Discogs names none. */
  description: string | null;
}

function coloursIn(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word in SWATCHES);
}

function swatch(word: string | undefined): string | undefined {
  return word ? SWATCHES[word] : undefined;
}

export function discSurface(vinylColors: readonly string[]): DiscSurface {
  const name = vinylColors[0];
  if (!name) return { base: LACQUER, clear: false, effect: null, description: null };

  const lower = name.toLowerCase();
  const colours = coloursIn(name);
  const clear = CLEAR_WORDS.some((w) => lower.includes(w));
  const kind = lower.includes('splatter')
    ? 'splatter'
    : /marble|swirl|galaxy|haze|smoke/.test(lower)
      ? 'marble'
      : null;

  // "Clear w/ Black Splatter" is a clear disc with black flecks; "Clear Blue" is a
  // tinted clear disc; "Blue Marbled" is blue with (unnamed, so white) marbling.
  const base = clear
    ? kind
      ? CLEAR_BASE
      : (swatch(colours[0]) ?? CLEAR_BASE)
    : (swatch(colours[0]) ?? LACQUER);
  const effectColour = clear ? swatch(colours[0]) : swatch(colours[1]);

  return {
    base,
    clear,
    effect: kind ? { kind, colour: effectColour ?? (clear ? LACQUER : PAPER_WHITE) } : null,
    description: `${name} vinyl`,
  };
}
