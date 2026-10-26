/**
 * GENERATED FILE - do not edit by hand.
 * Source: packages/contract/openapi.yaml
 * Regenerate with: pnpm --filter @vinylshelf/contract generate
 */

export interface paths {
    "/auth/discogs/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * OAuth callback; establishes a session
         * @description The browser navigates here directly, so failures redirect back to the web app
         *     with a `loginError` query parameter instead of returning a JSON body the user
         *     would be stranded on. Only a request that is not an OAuth callback at all
         *     (neither `oauth_token` nor `denied` present) gets a 400 problem response.
         */
        get: operations["finishDiscogsLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/discogs/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Begin the Discogs OAuth 1.0a flow
         * @description Redirects the browser to Discogs' authorization page. The request-token secret is
         *     kept in a short-lived encrypted cookie until the callback (see
         *     docs/adr/0006-sessions-tokens-and-shelf-references.md).
         */
        get: operations["startDiscogsLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** End the session */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/facets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the user's shelf can be filtered by
         * @description The genres, styles, decades and colourways on the user's vinyl shelf, each with
         *     how many records have it, for the library's filters. Counted over records whose
         *     Discogs data is fresh (ADR 0004); `expiresAt` is when the first of them expires.
         */
        get: operations["getCollectionFacets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start (or resume) importing the user's Discogs collection
         * @description Idempotent per user: if an import is already queued or running, that job is
         *     returned instead of creating a second one. Imports are resumable and
         *     checkpointed server-side (see docs/adr/0003-postgres-as-job-queue.md).
         *     An explicit request is not subject to the automatic-refresh cooldown described
         *     on `CollectionRefresh`.
         */
        post: operations["startCollectionImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/imports/{importId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Poll an import job */
        get: operations["getCollectionImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/imports/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The user's most recent import job
         * @description Lets a client that has lost the job id (for example after a reload) find a
         *     running import, including one started automatically by a refresh.
         */
        get: operations["getLatestCollectionImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the user's collection (cursor-paginated)
         * @description Stale-while-revalidate with a cutoff (docs/adr/0004-discogs-data-lifecycle.md):
         *     items whose Discogs data is past `expiresAt` are never returned. They are
         *     counted in `refresh.hiddenCount`, and the server starts a background refresh
         *     import when needed. The `refresh` object tells the client which of these states
         *     it is in, so an expired shelf renders as "refreshing", not as empty.
         */
        get: operations["listCollectionItems"];
        put?: never;
        /**
         * Add a release to the user's Discogs collection
         * @description Writes the release to the user's Discogs collection (folder 1, "Uncategorized"),
         *     then puts it on the shelf (docs/adr/0009-writing-to-the-discogs-collection.md).
         *     Discogs is written first; if that fails nothing changes here.
         *
         *     Discogs allows several copies of a release, so a release already on the shelf is
         *     refused with 409 `already_in_collection` unless `allowDuplicate` is true. Clients
         *     set it only after the user confirms they own another copy.
         */
        post: operations["addCollectionItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness and readiness probe */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listen-sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Open a listen session
         * @description A listen session groups recognition attempts for one client. Today it maps 1:1 to
         *     a browser tab; it exists so a second device can attach later (phone pairing)
         *     without changing the attempt flow. See docs/adr/0002.
         */
        post: operations["createListenSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listen-sessions/{sessionId}/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a recognition attempt */
        post: operations["createRecognitionAttempt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current user */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recognition-attempts/{attemptId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current state of an attempt (polling fallback) */
        get: operations["getRecognitionAttempt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recognition-attempts/{attemptId}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Upload the audio clip for an attempt
         * @description Short clip only (the recognition vendor analyses roughly the first 12 seconds;
         *     the server enforces a 10 MB cap). The clip is processed and discarded; it is
         *     never persisted.
         */
        put: operations["uploadAttemptAudio"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recognition-attempts/{attemptId}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Server-sent event stream for one attempt
         * @description Emits an `attempt` event with a full `RecognitionAttempt` payload on every state
         *     transition, then closes the stream once the attempt reaches a terminal state.
         *     Supports `Last-Event-ID` so a reconnecting client receives the current state
         *     immediately.
         */
        get: operations["streamAttemptEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/releases/{discogsId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Release detail
         * @description Full detail for one Discogs release (tracklist, credits, formats, colourways),
         *     served from the TTL-bound cache and fetched from Discogs when missing or
         *     expired (ADR 0004). Like every Discogs-sourced response it carries
         *     `fetchedAt` and `expiresAt`.
         */
        get: operations["getRelease"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/releases/{discogsId}/previews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 30-second previews for a release's tracks
         * @description Matches the release's tracklist to songs in the iTunes Store and returns a
         *     30-second preview URL for each track that matched with confidence
         *     (docs/adr/0010-track-previews-from-itunes.md). Looked up on first request and
         *     cached for 24 hours, including "no match". The audio streams from Apple to the
         *     client and is never stored.
         *
         *     Clients MUST show `attribution` and a link to `albumUrl` (with Apple's approved
         *     badge) wherever previews play. A release with no match returns 200 with
         *     `albumUrl: null` and every `previewUrl` null.
         */
        get: operations["getReleasePreviews"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/releases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search Discogs for vinyl releases
         * @description Search by title, artist, catalogue number or barcode, to add a record to the
         *     shelf (and, later, as the fallback when recognition fails). Limited to vinyl
         *     releases. Results are Discogs data passed straight through: never stored, shown
         *     with the Discogs credit, and subject to `expiresAt` like any other
         *     (docs/adr/0009-writing-to-the-discogs-collection.md). Search has its own per-user
         *     rate limit, since every user shares one Discogs request budget.
         */
        get: operations["searchReleases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/wantlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One page of the user's Discogs wantlist, newest first
         * @description Read live from Discogs and never stored as a list
         *     (docs/adr/0011-the-wantlist.md). Each release carries `fetchedAt` and
         *     `expiresAt` like any Discogs data. All formats are included.
         */
        get: operations["listWantlist"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/wantlist/{discogsId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                discogsId: number;
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Add a release to the user's Discogs wantlist
         * @description Idempotent: adding a release already wanted returns it unchanged (ADR 0011).
         */
        put: operations["addToWantlist"];
        post?: never;
        /**
         * Remove a release from the user's Discogs wantlist
         * @description Removing a release that is not wanted is treated as done.
         */
        delete: operations["removeFromWantlist"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        AttemptStatus: "created" | "capturing" | "uploaded" | "recognizing" | "matched" | "no_match" | "failed" | "expired";
        /**
         * @description `paired_phone` is reserved for the deferred phone-pairing feature and is
         *     rejected by the server until it ships.
         * @enum {string}
         */
        CaptureSource: "laptop_mic" | "file_upload" | "paired_phone";
        CollectionFacets: {
            colourways: {
                black: number;
                coloured: number;
            };
            /** @description Oldest first. Records with no known year are not counted. */
            decades: {
                count: number;
                /** @description The decade's first year, e.g. 1970. */
                decade: number;
            }[];
            /**
             * Format: date-time
             * @description When the first counted record's data expires; null for an empty shelf.
             */
            expiresAt: string | null;
            /** @description Most records first, then by name. */
            genres: components["schemas"]["FacetCount"][];
            /** @description Most records first, then by name. */
            styles: components["schemas"]["FacetCount"][];
        };
        CollectionItem: {
            /** Format: date-time */
            dateAdded: string;
            /** @description Discogs collection instance id (a user may own several copies). */
            instanceId: number;
            release: components["schemas"]["ReleaseSummary"];
        };
        /**
         * @description The shelf holds vinyl only. A release counts as vinyl when any of its formats is
         *     Vinyl (an LP-and-CD box set is on the shelf); CDs, cassettes and other formats
         *     in the Discogs collection are left off and counted in `otherFormatsCount`.
         *     Releases whose formats are not yet known (cached before 0.5.0) are treated as
         *     vinyl until the next import.
         */
        CollectionPage: {
            items: components["schemas"]["CollectionItem"][];
            /**
             * @description Records that match the filters given (genre, style, decade, colourway), among
             *     those whose data is fresh. Equal to the visible shelf when no filter is given.
             *     The same on every page.
             */
            matchedItems: number;
            nextCursor?: string | null;
            /**
             * @description Releases in the user's Discogs collection that are not vinyl, and so are not
             *     on the shelf. The same on every page.
             */
            otherFormatsCount: number;
            refresh: components["schemas"]["CollectionRefresh"];
            /**
             * @description Vinyl records on the user's shelf, including any withheld while their data
             *     refreshes (`refresh.hiddenCount`). The same on every page.
             */
            totalItems: number;
        };
        /**
         * @description Freshness of the user's shelf. Describes the whole shelf, not just this page.
         *
         *     - `idle`: no refresh in progress. If `items` is empty and `hiddenCount` is 0,
         *       the shelf really is empty.
         *     - `refreshing`: a refresh import (`importId`) is queued or running. Clients
         *       SHOULD render `hiddenCount` placeholders rather than an empty list, and poll
         *       the import.
         *     - `backoff`: the latest import failed recently, so the server is not starting
         *       another one until `retryAt` (a cooldown that protects the Discogs rate
         *       limit). Clients SHOULD say the shelf could not be refreshed and when it will
         *       retry. `POST /collection/imports` remains available for an explicit retry.
         */
        CollectionRefresh: {
            /** @description Shelf items withheld because their Discogs data is past `expiresAt`. */
            hiddenCount: number;
            /**
             * Format: uuid
             * @description The refreshing import, or the failed one in `backoff`.
             */
            importId: string | null;
            /**
             * Format: date-time
             * @description Set only in `backoff`; earliest time an automatic refresh starts.
             */
            retryAt: string | null;
            /** @enum {string} */
            status: "idle" | "refreshing" | "backoff";
        };
        FacetCount: {
            count: number;
            name: string;
        };
        ImportJob: {
            /** Format: date-time */
            createdAt: string;
            error?: components["schemas"]["Problem"];
            /** Format: uuid */
            id: string;
            progress?: {
                fetched?: number;
                total?: number;
            };
            /** @enum {string} */
            status: "queued" | "running" | "succeeded" | "failed";
            /** Format: date-time */
            updatedAt: string;
        };
        ListenSession: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            id: string;
        };
        /**
         * @description Value of the `loginError` query parameter the callback redirects with.
         *     `access_denied`: the user declined on Discogs. `invalid_request_token`: the
         *     request token is missing, expired or does not match. `discogs_unavailable`:
         *     Discogs failed or could not be reached.
         * @enum {string}
         */
        LoginErrorCode: "access_denied" | "invalid_request_token" | "discogs_unavailable";
        Problem: {
            /** @description Stable machine-readable error code. */
            code?: string;
            detail?: string;
            instance?: string;
            status: number;
            title: string;
            /** Format: uri-reference */
            type: string;
        };
        RecognitionAttempt: {
            /** Format: date-time */
            createdAt: string;
            error?: components["schemas"]["Problem"] | null;
            /**
             * Format: date-time
             * @description Attempts not completed by this time move to `expired`.
             */
            expiresAt: string;
            /** Format: uuid */
            id: string;
            result?: components["schemas"]["RecognitionResult"] | null;
            /** Format: uuid */
            sessionId: string;
            source: components["schemas"]["CaptureSource"];
            status: components["schemas"]["AttemptStatus"];
        };
        RecognitionResult: {
            /** @description Vinyl pressings matched on Discogs. May be empty. */
            candidateReleases: components["schemas"]["ReleaseSummary"][];
            track: {
                album?: string | null;
                artist: string;
                title: string;
            };
        };
        Release: components["schemas"]["ReleaseSummary"] & {
            catalogNumber: string | null;
            /**
             * @description What the Discogs community says about this release: its average rating
             *     and how many members own it and want it. Discogs data, shown with the
             *     Discogs credit.
             */
            community: {
                have: number;
                rating: {
                    /** @description Mean of the community's 1 to 5 ratings; 0 when unrated. */
                    average: number;
                    count: number;
                };
                want: number;
            };
            /** @description Release-level credits (the liner notes), in Discogs order. */
            credits: {
                name: string;
                role: string;
            }[];
            /** @description Format lines as Discogs describes them, e.g. "Vinyl, LP, Album". */
            formats: string[];
            genres: string[];
            label: string | null;
            styles: string[];
            tracklist: {
                duration?: string | null;
                position: string;
                title: string;
            }[];
        };
        ReleasePreviews: {
            /**
             * Format: uri
             * @description The matched album in the iTunes Store, the target of Apple's badge. Null when
             *     nothing matched.
             */
            albumUrl: string | null;
            /** @description Text Apple requires beside previews, shown as given. */
            attribution: string;
            discogsId: number;
            /**
             * Format: date-time
             * @description When the match is looked up again (24 hours after `fetchedAt`).
             */
            expiresAt: string;
            /** Format: date-time */
            fetchedAt: string;
            /** @description One entry per track of `Release.tracklist`, in the same order. */
            tracks: {
                /** @description The track's `position` in `Release.tracklist`. */
                position: string;
                /**
                 * Format: uri
                 * @description 30 seconds of audio, streamed only. Null when unmatched.
                 */
                previewUrl: string | null;
                /**
                 * Format: uri
                 * @description The matched song in the iTunes Store.
                 */
                storeUrl: string | null;
            }[];
        };
        ReleaseSummary: {
            artists: string[];
            /**
             * Format: uri
             * @description Hotlinked Discogs image URL. Never stored; subject to `expiresAt`.
             */
            coverImageUrl?: string | null;
            discogsId: number;
            /**
             * Format: uri
             * @description Link target for the mandatory "Data provided by Discogs" credit.
             */
            discogsUrl: string;
            /**
             * Format: date-time
             * @description Hard display deadline (at most 6 hours after `fetchedAt`).
             */
            expiresAt: string;
            /** Format: date-time */
            fetchedAt: string;
            title: string;
            /**
             * @description Colourways named in the release's Discogs format text, e.g. ["Blue Marbled"].
             *     Empty when Discogs names none; clients must not invent a colour (render
             *     standard black).
             */
            vinylColors: string[];
            year?: number | null;
        };
        SearchPage: {
            page: number;
            pages: number;
            results: components["schemas"]["SearchResult"][];
            totalResults: number;
        };
        /**
         * @description A release as Discogs search describes it: enough to recognise the right pressing
         *     and add it. Fetch `/releases/{discogsId}` for the full detail.
         */
        SearchResult: {
            artists: string[];
            catalogNumber: string | null;
            country: string | null;
            discogsId: number;
            /**
             * Format: uri
             * @description Link target for the mandatory "Data provided by Discogs" credit.
             */
            discogsUrl: string;
            /**
             * Format: date-time
             * @description Hard display deadline (at most 6 hours after `fetchedAt`).
             */
            expiresAt: string;
            /** Format: date-time */
            fetchedAt: string;
            /** @description Format descriptors as Discogs lists them, e.g. ["Vinyl", "LP", "Album"]. */
            formats: string[];
            /**
             * @description At least one copy is already on the user's shelf (as of their last import),
             *     so adding it needs `allowDuplicate`. Same check as the 409 on
             *     `addCollectionItem`.
             */
            inCollection: boolean;
            /** @description On the user's Discogs wantlist, as Discogs reports with the result. */
            inWantlist: boolean;
            label: string | null;
            /**
             * Format: uri
             * @description Hotlinked Discogs thumbnail. Never stored; subject to `expiresAt`.
             */
            thumbUrl: string | null;
            title: string;
            year: number | null;
        };
        User: {
            discogsUsername: string;
            /** Format: uuid */
            id: string;
        };
        WantlistItem: {
            /** Format: date-time */
            dateAdded: string;
            release: components["schemas"]["ReleaseSummary"];
        };
        WantlistPage: {
            items: components["schemas"]["WantlistItem"][];
            page: number;
            pages: number;
            /** @description Releases on the wantlist, all formats. */
            totalItems: number;
        };
    };
    responses: {
        /**
         * @description The request's `Origin` does not match the web app (CSRF protection for
         *     cookie-authenticated unsafe methods).
         */
        ForbiddenOrigin: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Error (RFC 9457 problem details). */
        Problem: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Upstream or local rate limit reached. */
        RateLimited: {
            headers: {
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        AttemptId: string;
        ImportId: string;
        SessionId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    finishDiscogsLogin: {
        parameters: {
            query?: {
                /** @description Sent by the provider instead of a verifier when the user declines. */
                denied?: string;
                oauth_token?: string;
                oauth_verifier?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /**
             * @description On success, the session cookie is set and the browser is redirected to the
             *     app. On failure, the browser is redirected to the app with
             *     `?loginError=<LoginErrorCode>` and no session is created.
             */
            302: {
                headers: {
                    Location?: string;
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Problem"];
        };
    };
    startDiscogsLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to Discogs. */
            302: {
                headers: {
                    Location?: string;
                    /** @description Short-lived encrypted request-token cookie. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /**
             * @description Too many login attempts from this client. Each attempt spends one request of
             *     the Discogs budget shared by every user, so it is limited per client.
             */
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session ended. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["ForbiddenOrigin"];
        };
    };
    getCollectionFacets: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The shelf's facets. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionFacets"];
                };
            };
            401: components["responses"]["Problem"];
        };
    };
    startCollectionImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Import accepted. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportJob"];
                };
            };
            401: components["responses"]["Problem"];
            403: components["responses"]["ForbiddenOrigin"];
        };
    };
    getCollectionImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                importId: components["parameters"]["ImportId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current job state. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportJob"];
                };
            };
            401: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
        };
    };
    getLatestCollectionImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The most recently created import job. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportJob"];
                };
            };
            401: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
        };
    };
    listCollectionItems: {
        parameters: {
            query?: {
                /**
                 * @description `coloured` for records whose colourway Discogs names, `black` for the rest
                 *     (see `ReleaseSummary.vinylColors`).
                 */
                colourway?: "coloured" | "black";
                /** @description Opaque cursor from a previous page. */
                cursor?: string;
                /** @description Only records released in this decade, given by its first year (1970 for the 1970s). */
                decade?: number;
                /** @description Only records with this Discogs genre (exact, as listed by `/collection/facets`). */
                genre?: string;
                limit?: number;
                sort?: "added_desc" | "added_asc" | "artist_asc" | "year_asc" | "year_desc";
                /** @description Only records with this Discogs style (exact, as listed by `/collection/facets`). */
                style?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of collection items. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionPage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
        };
    };
    addCollectionItem: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default false */
                    allowDuplicate?: boolean;
                    discogsId: number;
                };
            };
        };
        responses: {
            /** @description Added; the new copy as it now appears on the shelf. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionItem"];
                };
            };
            400: components["responses"]["Problem"];
            /** @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            403: components["responses"]["ForbiddenOrigin"];
            /** @description No such release on Discogs (`code: release_not_found`). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Already on the shelf and `allowDuplicate` was not set
             *     (`code: already_in_collection`).
             */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Service is up. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ok" | "degraded";
                    };
                };
            };
        };
    };
    createListenSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListenSession"];
                };
            };
            401: components["responses"]["Problem"];
        };
    };
    createRecognitionAttempt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: components["parameters"]["SessionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    source: components["schemas"]["CaptureSource"];
                };
            };
        };
        responses: {
            /** @description Attempt created in state `created`. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecognitionAttempt"];
                };
            };
            404: components["responses"]["Problem"];
            429: components["responses"]["RateLimited"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The signed-in user. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            401: components["responses"]["Problem"];
        };
    };
    getRecognitionAttempt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attemptId: components["parameters"]["AttemptId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The attempt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecognitionAttempt"];
                };
            };
            404: components["responses"]["Problem"];
        };
    };
    uploadAttemptAudio: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attemptId: components["parameters"]["AttemptId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "audio/mp4": string;
                "audio/mpeg": string;
                "audio/wav": string;
                "audio/webm": string;
            };
        };
        responses: {
            /** @description Clip accepted; result will arrive on the event stream. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecognitionAttempt"];
                };
            };
            404: components["responses"]["Problem"];
            /** @description Attempt is not in a state that accepts audio. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
        };
    };
    streamAttemptEvents: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attemptId: components["parameters"]["AttemptId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Event stream. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            404: components["responses"]["Problem"];
        };
    };
    getRelease: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                discogsId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The release. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Release"];
                };
            };
            401: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    getReleasePreviews: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                discogsId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The release's previews, as far as they could be matched. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReleasePreviews"];
                };
            };
            /**
             * @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`)
             *     while fetching the tracklist to match.
             */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description No such release on Discogs (`code: release_not_found`). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            429: components["responses"]["RateLimited"];
            /**
             * @description The iTunes Store or Discogs is unavailable (`code: previews_unavailable` or
             *     `discogs_unavailable`).
             */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    searchReleases: {
        parameters: {
            query: {
                page?: number;
                q: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of search results. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchPage"];
                };
            };
            400: components["responses"]["Problem"];
            /** @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    listWantlist: {
        parameters: {
            query?: {
                page?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of the wantlist. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WantlistPage"];
                };
            };
            /** @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    addToWantlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                discogsId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The release as it now stands on the wantlist. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WantlistItem"];
                };
            };
            /** @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            403: components["responses"]["ForbiddenOrigin"];
            /** @description No such release on Discogs (`code: release_not_found`). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
    removeFromWantlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                discogsId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No longer on the wantlist. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or Discogs access was revoked (`code: discogs_auth_revoked`). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            403: components["responses"]["ForbiddenOrigin"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["Problem"];
        };
    };
}
