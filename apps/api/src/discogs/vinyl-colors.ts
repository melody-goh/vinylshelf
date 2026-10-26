/**
 * Discogs records a vinyl pressing's colour only as free text on its format ("Blue
 * Marbled", "Clear, 180g", "Gatefold"). This keeps the parts that name a colour or a
 * colour effect, and drops everything else. When nothing qualifies, the result is
 * empty: the UI then shows standard black rather than guessing (contract:
 * ReleaseSummary.vinylColors).
 */

// prettier-ignore
const COLOUR_WORDS = new Set([
  // colours
  'black', 'white', 'grey', 'gray', 'silver', 'gold', 'red', 'crimson', 'maroon', 'pink',
  'magenta', 'purple', 'violet', 'lavender', 'blue', 'navy', 'teal', 'turquoise', 'aqua',
  'cyan', 'green', 'olive', 'mint', 'yellow', 'mustard', 'orange', 'amber', 'brown',
  'bronze', 'copper', 'tan', 'beige', 'cream', 'bone', 'ivory', 'clear', 'transparent',
  'translucent', 'opaque', 'smoke', 'smokey', 'smoky', 'coke', 'milky', 'glow',
  // colour effects
  'marbled', 'marble', 'splatter', 'splattered', 'swirl', 'swirled', 'galaxy', 'haze',
  'starburst', 'sunburst', 'tie-dye', 'colour-in-colour', 'color-in-color', 'picture',
  'multicolor', 'multicolour', 'multi-color', 'multi-colour', 'coloured', 'colored',
]);

/** A segment names a colour when any of its words is a known colour or effect. */
function namesColour(segment: string): boolean {
  return segment
    .toLowerCase()
    .split(/[\s/&+]+/)
    .some((word) => COLOUR_WORDS.has(word.replace(/[^a-z-]/g, '')));
}

export interface DiscogsFormat {
  name: string;
  text?: string | undefined;
}

/** Colourways named across a release's vinyl formats, in order, without duplicates. */
export function vinylColorsOf(formats: readonly DiscogsFormat[]): string[] {
  const colours: string[] = [];
  for (const format of formats) {
    if (format.name.toLowerCase() !== 'vinyl' || !format.text) continue;
    for (const segment of format.text.split(/[,;]/)) {
      const trimmed = segment.trim();
      if (trimmed && namesColour(trimmed) && !colours.includes(trimmed)) colours.push(trimmed);
    }
  }
  return colours;
}
