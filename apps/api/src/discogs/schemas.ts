/**
 * Zod schemas for the Discogs responses we consume (ADR 0004 §1). They describe only
 * the fields we read. Unknown fields are dropped, so Discogs adding data never breaks
 * us, but a field we rely on changing type fails loudly at the boundary.
 */
import { z } from 'zod';

/** OAuth token endpoints answer with a form-encoded body, not JSON. */
export const requestTokenResponse = z.object({
  oauth_token: z.string().min(1),
  oauth_token_secret: z.string().min(1),
  oauth_callback_confirmed: z.literal('true'),
});

export const accessTokenResponse = z.object({
  oauth_token: z.string().min(1),
  oauth_token_secret: z.string().min(1),
});

export const identityResponse = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
});

const artist = z.object({
  name: z.string(),
});

export const collectionReleasesResponse = z.object({
  pagination: z.object({
    page: z.number().int().min(1),
    pages: z.number().int().min(0),
    items: z.number().int().min(0),
  }),
  releases: z.array(
    z.object({
      id: z.number().int().positive(),
      instance_id: z.number().int().positive(),
      date_added: z.iso.datetime({ offset: true }),
      basic_information: z.object({
        id: z.number().int().positive(),
        title: z.string(),
        year: z.number().int().min(0),
        cover_image: z.string().optional(),
        artists: z.array(artist),
        formats: z.array(z.object({ name: z.string(), text: z.string().optional() })).default([]),
      }),
    }),
  ),
});
export type CollectionReleasesResponse = z.infer<typeof collectionReleasesResponse>;
