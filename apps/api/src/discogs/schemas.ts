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

/** The release summary Discogs embeds in collection and wantlist entries. */
const basicInformation = z.object({
  id: z.number().int().positive(),
  /** 0 when the release belongs to no master. */
  master_id: z.number().int().min(0).default(0),
  title: z.string(),
  year: z.number().int().min(0),
  cover_image: z.string().optional(),
  artists: z.array(artist),
  formats: z.array(z.object({ name: z.string(), text: z.string().optional() })).default([]),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
});
export type BasicInformation = z.infer<typeof basicInformation>;

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
      basic_information: basicInformation,
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
  master_id: z.number().int().min(0).optional(),
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
  community: z
    .object({
      have: z.number().int().min(0).default(0),
      want: z.number().int().min(0).default(0),
      rating: z
        .object({ count: z.number().int().min(0), average: z.number().min(0).max(5) })
        .default({ count: 0, average: 0 }),
    })
    .default({ have: 0, want: 0, rating: { count: 0, average: 0 } }),
});
export type ReleaseResponse = z.infer<typeof releaseResponse>;

/** `GET /database/search`: one page of results. Discogs sends strings where it can. */
export const searchResponse = z.object({
  pagination: z.object({
    page: z.number().int().min(1),
    pages: z.number().int().min(0),
    items: z.number().int().min(0),
  }),
  results: z.array(
    z.object({
      id: z.number().int().positive(),
      type: z.string(),
      /** "Artist - Title", as Discogs shows it. */
      title: z.string(),
      year: z.string().optional(),
      country: z.string().optional(),
      label: z.array(z.string()).default([]),
      catno: z.string().optional(),
      format: z.array(z.string()).default([]),
      thumb: z.string().optional(),
      /** Present when the search is made as a signed-in user. */
      user_data: z.object({ in_wantlist: z.boolean().default(false) }).optional(),
    }),
  ),
});
export type SearchResponse = z.infer<typeof searchResponse>;

/** `POST /users/{username}/collection/folders/{folder}/releases/{release}` (201). */
export const addToCollectionResponse = z.object({
  instance_id: z.number().int().positive(),
});

/** One release on a wantlist, as listed and as returned when added. */
export const wantResponse = z.object({
  id: z.number().int().positive(),
  date_added: z.iso.datetime({ offset: true }),
  basic_information: basicInformation,
});

/** `GET /users/{username}/wants`: one page of the wantlist. */
export const wantlistResponse = z.object({
  pagination: z.object({
    page: z.number().int().min(1),
    pages: z.number().int().min(0),
    items: z.number().int().min(0),
  }),
  wants: z.array(wantResponse),
});
export type WantResponse = z.infer<typeof wantResponse>;
