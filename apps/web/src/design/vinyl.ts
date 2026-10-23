/**
 * Turns Discogs' named colourways ("Blue Marbled", "Clear w/ Black Splatter") into a
 * disc surface. Only what Discogs names is drawn: no name means standard black, never a
 * guessed colour (PRODUCT.md: evidence; contract: ReleaseSummary.vinylColors).
 */

const LACQUER = '#121212';

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

export interface DiscSurface {
  /** CSS background layers for the disc. */
  background: string;
  /** Whether the disc reads as light, so grooves and edges are drawn darker. */
  light: boolean;
  /** The colourway as a person would say it, for the accessible label. */
  description: string;
}

function coloursIn(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word in SWATCHES);
}

function isLight(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function discSurface(vinylColors: readonly string[]): DiscSurface {
  const name = vinylColors[0];
  if (!name) return { background: LACQUER, light: false, description: 'black vinyl' };

  const lower = name.toLowerCase();
  const colours = coloursIn(name);
  const clear = CLEAR_WORDS.some((w) => lower.includes(w));
  const base = colours[0] ? (SWATCHES[colours[0]] ?? LACQUER) : clear ? '#d8dde0' : LACQUER;
  const second = colours[1] ? (SWATCHES[colours[1]] ?? '#ffffff') : '#ffffff';

  const layers: string[] = [];
  if (lower.includes('splatter')) {
    layers.push(
      `radial-gradient(circle at 22% 30%, ${second} 0 4%, transparent 4.5%)`,
      `radial-gradient(circle at 68% 24%, ${second} 0 3%, transparent 3.5%)`,
      `radial-gradient(circle at 76% 70%, ${second} 0 5%, transparent 5.5%)`,
      `radial-gradient(circle at 30% 78%, ${second} 0 2.5%, transparent 3%)`,
    );
  }
  if (/marble|swirl|galaxy|haze|smoke/.test(lower)) {
    layers.push(
      `radial-gradient(ellipse 60% 30% at 35% 40%, ${second}55, transparent 70%)`,
      `radial-gradient(ellipse 40% 55% at 70% 65%, ${second}40, transparent 70%)`,
    );
  }
  layers.push(clear ? `${base}b3` : base);

  return {
    background: layers.join(', '),
    light: clear || isLight(base),
    description: `${name} vinyl`,
  };
}
