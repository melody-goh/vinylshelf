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

const format = z.object({
  name: z.string(),
  qty: z.string().optional(),
  text: z.string().optional(),
  descriptions: z.array(z.string()).optional(),
});

export const releaseResponse = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().min(0).optional(),
  artists: z.array(artist),
  labels: z.array(z.object({ name: z.string(), catno: z.string().optional() })).default([]),
  formats: z.array(format).default([]),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  tracklist: z
    .array(
      z.object({
        position: z.string(),
        title: z.string(),
        duration: z.string().optional(),
        type_: z.string().optional(),
      }),
    )
    .default([]),
  extraartists: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
  images: z.array(z.object({ type: z.string(), uri: z.string() })).default([]),
});
export type ReleaseResponse = z.infer<typeof releaseResponse>;
