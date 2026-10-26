/**
 * Database schema. What we persist, and for how long, is a compliance decision as much
 * as a technical one. See ADR 0004 (Discogs data lifecycle) and ADR 0006 (sessions,
 * tokens and shelf references) before adding columns that hold Discogs data.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  halfvec,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Problem } from '@vinylshelf/contract';
import type { CatalogueManifest, Credit } from '../catalogue/model.js';
import type { MatchedTrack } from '../itunes/match.js';
import type { ReleaseDetailData } from '../discogs/gateway.js';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const updatedAt = () => timestamptz('updated_at').notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  discogsUserId: integer('discogs_user_id').notNull().unique(),
  discogsUsername: text('discogs_username').notNull(),
  /** AES-256-GCM ciphertext (ADR 0006). Never log or return these. */
  oauthTokenEnc: text('oauth_token_enc').notNull(),
  oauthSecretEnc: text('oauth_secret_enc').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie value; the cookie itself is never stored (ADR 0006). */
    idHash: text('id_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const importStatus = pgEnum('import_status', ['queued', 'running', 'succeeded', 'failed']);
export type ImportStatus = (typeof importStatus.enumValues)[number];

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: importStatus('status').notNull().default('queued'),
    /** Checkpoint: the next Discogs collection page to fetch (ADR 0003). */
    cursorPage: integer('cursor_page').notNull().default(1),
    fetched: integer('fetched').notNull().default(0),
    total: integer('total'),
    error: jsonb('error').$type<Problem>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    // At most one active import per user, enforced by the database rather than by a
    // check-then-insert race in application code. This makes POST /collection/imports
    // idempotent.
    uniqueIndex('import_jobs_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} in ('queued', 'running')`),
    index('import_jobs_user_created_idx').on(t.userId, t.createdAt.desc()),
    check('import_jobs_cursor_page_positive', sql`${t.cursorPage} >= 1`),
    check('import_jobs_fetched_non_negative', sql`${t.fetched} >= 0`),
  ],
);

/**
 * Shelf references: the only collection data kept beyond the cache TTL (ADR 0006 §6).
 * Instance id, release id and date added, and nothing else from the collection.
 */
export const collectionItems = pgTable(
  'collection_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Discogs instance ids are approaching the int4 limit, so store them as int8.
    instanceId: bigint('instance_id', { mode: 'number' }).notNull(),
    releaseId: integer('release_id').notNull(),
    /**
     * The release's Discogs master, or null when it has none. An identifier like
     * release_id (ADR 0006, note of 2026-10-27): it links a shelf record to the CC0 taste
     * catalogue without keeping any Discogs data past its deadline.
     */
    masterId: integer('master_id'),
    dateAdded: timestamptz('date_added').notNull(),
    /** Set by each import; rows an import did not see are deleted when it succeeds. */
    lastSeenImportId: uuid('last_seen_import_id').references(() => importJobs.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.instanceId] }),
    index('collection_items_user_added_idx').on(t.userId, t.dateAdded, t.instanceId),
    index('collection_items_release_idx').on(t.releaseId),
  ],
);

export const discogsClassification = pgEnum('discogs_classification', ['cc0', 'restricted']);
export type DiscogsClassification = (typeof discogsClassification.enumValues)[number];

/**
 * TTL-bound cache of Discogs release summaries (ADR 0004 §2). Rows are never read past
 * `expires_at`, and the CHECK makes a row with a longer lifetime impossible to write,
 * whatever the application code does.
 */
export const discogsReleaseCache = pgTable(
  'discogs_release_cache',
  {
    discogsId: integer('discogs_id').primaryKey(),
    title: text('title').notNull(),
    artists: jsonb('artists').$type<string[]>().notNull(),
    /** Lower-cased first artist, for the `artist_asc` sort. */
    artistSort: text('artist_sort').notNull(),
    year: integer('year'),
    vinylColors: jsonb('vinyl_colors')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * Discogs format names. Null for rows cached before formats were kept; those count
     * as vinyl until the next import rewrites them.
     */
    formatNames: jsonb('format_names').$type<string[]>(),
    /** Discogs genres and styles; null for rows cached before they were kept. */
    genres: jsonb('genres').$type<string[]>(),
    styles: jsonb('styles').$type<string[]>(),
    /** A Discogs URL we hotlink. The image itself is never stored (ADR 0004 §6). */
    coverImageUrl: text('cover_image_url'),
    discogsUrl: text('discogs_url').notNull(),
    /** Most restrictive classification of any field in the row. */
    classification: discogsClassification('classification').notNull(),
    fetchedAt: timestamptz('fetched_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    index('discogs_release_cache_expires_idx').on(t.expiresAt),
    check(
      'discogs_release_cache_ttl_max_6h',
      sql`${t.expiresAt} > ${t.fetchedAt} and ${t.expiresAt} <= ${t.fetchedAt} + interval '6 hours'`,
    ),
  ],
);

/**
 * Full release detail (tracklist, credits, formats), fetched on demand when a record is
 * opened. The same lifecycle as the summary cache (ADR 0004): hard expiry within 6
 * hours, enforced on read and by the CHECK below.
 */
export const discogsReleaseDetailCache = pgTable(
  'discogs_release_detail_cache',
  {
    discogsId: integer('discogs_id').primaryKey(),
    detail: jsonb('detail').$type<ReleaseDetailData>().notNull(),
    classification: discogsClassification('classification').notNull(),
    fetchedAt: timestamptz('fetched_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    index('discogs_release_detail_cache_expires_idx').on(t.expiresAt),
    check(
      'discogs_release_detail_cache_ttl_max_6h',
      sql`${t.expiresAt} > ${t.fetchedAt} and ${t.expiresAt} <= ${t.fetchedAt} + interval '6 hours'`,
    ),
  ],
);

/** What a preview lookup found, as cached: one entry per track, or nulls (ADR 0010 §4). */
export interface StoredPreviews {
  albumUrl: string | null;
  tracks: MatchedTrack[];
}

/**
 * Cached iTunes matches per release, including "no match", so Apple is asked at most
 * once a day per record. Only the match is kept; preview audio never touches our
 * servers (Apple's terms). The CHECK caps a row's lifetime at 24 hours.
 */
export const itunesPreviewCache = pgTable(
  'itunes_preview_cache',
  {
    discogsId: integer('discogs_id').primaryKey(),
    previews: jsonb('previews').$type<StoredPreviews>().notNull(),
    fetchedAt: timestamptz('fetched_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    index('itunes_preview_cache_expires_idx').on(t.expiresAt),
    check(
      'itunes_preview_cache_ttl_max_24h',
      sql`${t.expiresAt} > ${t.fetchedAt} and ${t.expiresAt} <= ${t.fetchedAt} + interval '24 hours'`,
    ),
  ],
);

/**
 * Dimensions of the catalogue's vectors: those of the embedding model (ADR 0008,
 * bge-small-en-v1.5). A different model means a new column size and a rebuilt catalogue.
 */
export const CATALOGUE_DIMS = 384;

/**
 * The taste catalogue (ADR 0008, ADR 0012): vinyl masters from Discogs' monthly CC0
 * dumps, with their embeddings. Unlike API data (ADR 0004) it may be kept, because the
 * dumps are CC0; it holds no user data and no images. Replaced whole by
 * `catalogue:load`, never edited row by row.
 */
export const catalogueMasters = pgTable(
  'catalogue_masters',
  {
    /** Discogs master id. */
    id: integer('id').primaryKey(),
    mainReleaseId: integer('main_release_id').notNull(),
    title: text('title').notNull(),
    artists: jsonb('artists').$type<string[]>().notNull(),
    year: integer('year'),
    genres: jsonb('genres').$type<string[]>().notNull(),
    styles: jsonb('styles').$type<string[]>().notNull(),
    labels: jsonb('labels').$type<string[]>().notNull(),
    country: text('country'),
    credits: jsonb('credits').$type<Credit[]>().notNull(),
    versions: integer('versions').notNull(),
    vinylVersions: integer('vinyl_versions').notNull(),
    /** Half precision: half the space of `vector`, ample for similarity (ADR 0012). */
    embedding: halfvec('embedding', { dimensions: CATALOGUE_DIMS }).notNull(),
  },
  (t) => [
    // HNSW for approximate nearest neighbours by cosine distance.
    index('catalogue_masters_embedding_idx').using('hnsw', t.embedding.op('halfvec_cosine_ops')),
  ],
);

/** Which catalogue is loaded: one row, the manifest it was built with (ADR 0012 §4). */
export const catalogueMeta = pgTable(
  'catalogue_meta',
  {
    id: smallint('id').primaryKey().default(1),
    manifest: jsonb('manifest').$type<CatalogueManifest>().notNull(),
    loadedAt: timestamptz('loaded_at').notNull(),
  },
  (t) => [check('catalogue_meta_single_row', sql`${t.id} = 1`)],
);

export const tasteVerdict = pgEnum('taste_verdict', ['more', 'less']);
export type TasteVerdict = (typeof tasteVerdict.enumValues)[number];

/**
 * How a user has steered their recommendations (ADR 0008): "more like this" or "not
 * for me" on a catalogue master. Keyed by catalogue id (CC0), so it holds no Discogs
 * API data; it is the user's own signal and goes with their account.
 */
export const tasteFeedback = pgTable(
  'taste_feedback',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    masterId: integer('master_id').notNull(),
    verdict: tasteVerdict('verdict').notNull(),
    createdAt: timestamptz('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.masterId] })],
);
