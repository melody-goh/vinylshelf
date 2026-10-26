/**
 * Zod schemas for our HTTP responses. They validate and serialise what the routes send
 * and must match `packages/contract/openapi.yaml` exactly. The contract tests enforce
 * that in two ways: the types are checked against the generated contract types, and
 * live responses are validated against the spec (ADR 0001).
 */
import { z } from 'zod';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
});

export const userSchema = z.object({
  id: z.uuid(),
  discogsUsername: z.string(),
});

export const importJobSchema = z.object({
  id: z.uuid(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  progress: z
    .object({
      fetched: z.number().int().min(0).optional(),
      total: z.number().int().min(0).optional(),
    })
    .optional(),
  error: problemSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const releaseSummarySchema = z.object({
  discogsId: z.number().int(),
  title: z.string(),
  artists: z.array(z.string()),
  year: z.number().int().nullable().optional(),
  vinylColors: z.array(z.string()),
  coverImageUrl: z.url().nullable().optional(),
  discogsUrl: z.url(),
  fetchedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const collectionItemSchema = z.object({
  instanceId: z.number().int(),
  release: releaseSummarySchema,
  dateAdded: z.iso.datetime(),
});

export const collectionRefreshSchema = z.object({
  status: z.enum(['idle', 'refreshing', 'backoff']),
  importId: z.uuid().nullable(),
  hiddenCount: z.number().int().min(0),
  retryAt: z.iso.datetime().nullable(),
});

export const collectionPageSchema = z.object({
  items: z.array(collectionItemSchema),
  totalItems: z.number().int().min(0),
  nextCursor: z.string().nullable().optional(),
  refresh: collectionRefreshSchema,
});

export const COLLECTION_SORTS = [
  'added_desc',
  'added_asc',
  'artist_asc',
  'year_asc',
  'year_desc',
] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export const collectionItemsQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(COLLECTION_SORTS).default('added_desc'),
});

export const releaseSchema = releaseSummarySchema.extend({
  label: z.string().nullable(),
  catalogNumber: z.string().nullable(),
  genres: z.array(z.string()),
  styles: z.array(z.string()),
  formats: z.array(z.string()),
  credits: z.array(z.object({ name: z.string(), role: z.string() })),
  tracklist: z.array(
    z.object({
      position: z.string(),
      title: z.string(),
      duration: z.string().nullable().optional(),
    }),
  ),
  community: z.object({
    rating: z.object({ average: z.number().min(0).max(5), count: z.number().int().min(0) }),
    have: z.number().int().min(0),
    want: z.number().int().min(0),
  }),
});

export const searchResultSchema = z.object({
  discogsId: z.number().int(),
  title: z.string(),
  artists: z.array(z.string()),
  year: z.number().int().nullable(),
  country: z.string().nullable(),
  label: z.string().nullable(),
  catalogNumber: z.string().nullable(),
  formats: z.array(z.string()),
  thumbUrl: z.url().nullable(),
  discogsUrl: z.url(),
  inCollection: z.boolean(),
  fetchedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const searchPageSchema = z.object({
  results: z.array(searchResultSchema),
  page: z.number().int().min(1),
  pages: z.number().int().min(0),
  totalResults: z.number().int().min(0),
});

export const searchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  page: z.coerce.number().int().min(1).default(1),
});

export const addCollectionItemBody = z.strictObject({
  discogsId: z.number().int().min(1),
  allowDuplicate: z.boolean().default(false),
});

export const releasePreviewsSchema = z.object({
  discogsId: z.number().int(),
  albumUrl: z.url().nullable(),
  attribution: z.string(),
  tracks: z.array(
    z.object({
      position: z.string(),
      previewUrl: z.url().nullable(),
      storeUrl: z.url().nullable(),
    }),
  ),
  fetchedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
