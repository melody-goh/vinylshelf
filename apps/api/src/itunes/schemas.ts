/**
 * Zod schemas for the parts of Apple's responses we use. Unknown fields are ignored, so
 * Apple adding fields never breaks us; a missing field we rely on is a typed error.
 */
import { z } from 'zod';

const album = z.object({
  wrapperType: z.literal('collection'),
  collectionId: z.number().int().positive(),
  collectionName: z.string(),
  artistName: z.string(),
  trackCount: z.number().int().min(0).default(0),
  collectionViewUrl: z.url(),
});

const song = z.object({
  wrapperType: z.literal('track'),
  kind: z.string().optional(),
  trackName: z.string(),
  discNumber: z.number().int().min(1).default(1),
  trackNumber: z.number().int().min(1),
  previewUrl: z.url().optional(),
  trackViewUrl: z.url(),
});

/**
 * Both endpoints wrap a mixed list in `results`: a search for albums may include other
 * kinds, and a lookup returns the album itself before its songs. Each item is parsed on
 * its own, so one odd item is skipped rather than failing the whole response.
 */
export const resultsEnvelope = z.object({ results: z.array(z.unknown()) });

export { album as albumResult, song as songResult };
