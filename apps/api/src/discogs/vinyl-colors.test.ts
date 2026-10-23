import { describe, expect, it } from 'vitest';
import { vinylColorsOf } from './vinyl-colors.js';

describe('vinylColorsOf', () => {
  it('keeps colour and effect text from vinyl formats', () => {
    expect(vinylColorsOf([{ name: 'Vinyl', text: 'Blue Marbled' }])).toEqual(['Blue Marbled']);
    expect(vinylColorsOf([{ name: 'Vinyl', text: 'Clear w/ Black Splatter' }])).toEqual([
      'Clear w/ Black Splatter',
    ]);
  });

  it('drops segments that are not colours (weight, packaging, edition)', () => {
    expect(vinylColorsOf([{ name: 'Vinyl', text: 'Red, 180g, Gatefold' }])).toEqual(['Red']);
    expect(vinylColorsOf([{ name: 'Vinyl', text: '180 Gram, Limited Edition' }])).toEqual([]);
  });

  it('collects each disc of a multi-disc set once, in order', () => {
    expect(
      vinylColorsOf([
        { name: 'Vinyl', text: 'Orange' },
        { name: 'Vinyl', text: 'Bone White' },
        { name: 'Vinyl', text: 'Orange' },
      ]),
    ).toEqual(['Orange', 'Bone White']);
  });

  it('ignores non-vinyl formats and formats without text', () => {
    expect(
      vinylColorsOf([
        { name: 'CD', text: 'Gold' },
        { name: 'Vinyl' },
        { name: 'All Media', text: 'Blue' },
      ]),
    ).toEqual([]);
  });
});
