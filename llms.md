# small-waffle — LLM Context Document

## What This Is
A lightweight Node.js server that serves [DDFCSV](https://open-numbers.github.io/ddf.html) datasets over HTTP. It wraps the `@vizabi/reader-ddfcsv` library in a Koa web server, clones dataset repos from GitHub, and resolves DDF queries encoded as [URLON](https://www.npmjs.com/package/urlon) in the URL query string. Designed to sit behind a CDN cache (Cloudflare). Successor to the heavier "big-waffle" solution.

**Version:** 2.3.1  
**Runtime:** Node.js, ESM (`"type": "module"`)  
**Framework:** Koa 2 + koa-router  
**Production process manager:** PM2 (see `pm2.config.cjs`)

---

## Architecture Overview

```
┌────────────────────────┐      ┌──────────────────────┐
│  Main Process (index.js)│◄────►│  Sidecar Process      │
│  PORT (default 3333)    │      │  PORT+1 (default 3334)│
│                         │      │                        │
│  Koa HTTP server        │      │  Plain node:http       │
│  - API routes           │      │  - /enqueue (clone/fetch)
│  - koa-static (assets)  │      │  - /status/:jobId      │
│  - koa-jwt (Supabase)   │      │  - /heartbeat          │
│  - koa-compress          │      │  - /cancel/:jobId      │
│  - CORS (permissive)    │      │                        │
│                         │      │  Runs git clone/fetch  │
│  DDFCsvReader instances  │      │  in isolation to avoid │
│  in-memory per dataset/  │      │  blocking main thread  │
│  branch                  │      │                        │
└────────────────────────┘      └──────────────────────┘
         │                                 │
         ▼                                 ▼
   ./datasets/                     isomorphic-git
   owner/repo/branch/              @octokit/auth-app
   (git working trees)
```

**Two processes run concurrently:**
1. **Main API** (`index.js`) — serves HTTP requests, holds DDFCsvReader instances in memory
2. **Git-ops sidecar** (`git-ops-sidecar-process.index.js`) — handles heavy `git clone` / `git fetch` operations in a separate process to avoid blocking the API. Communicates via internal HTTP on `127.0.0.1:PORT+1` with a shared secret (`SIDECAR_SECRET`). Has a job queue with retry (up to 3 attempts with exponential backoff). If the sidecar is unavailable, the main process falls back to doing git operations itself.

---

## Directory Layout

```
small-waffle/
├── index.js                         # Entry point, Koa app setup, graceful shutdown
├── git-ops-sidecar-process.index.js # Sidecar process for git clone/fetch
├── pm2.config.cjs                   # PM2 production config (2 apps)
├── package.json
├── .env.example                     # Environment variable template
├── src/
│   ├── api.js                       # All route definitions (initRoutes)
│   ├── api-redirect-logic.js        # Shared redirect/validation/auth logic for dataset routes
│   ├── api-errors.js                # Known error catalog [status, short, long]
│   ├── api-getinfo-allds.js         # GET /info (all datasets, filtered by ACL)
│   ├── datasetManagement.js         # Load/sync datasets, reader instances, branch-commit mapping
│   ├── datasetControl.js            # Dataset control list (from Google Sheet or Supabase DB)
│   ├── accessControl.js             # ACL: user and permalink access checks (from Supabase DB)
│   ├── resultTransformer.js         # Transforms DDFCsvReader output to {header, rows} format
│   ├── event-analytics.js           # In-memory request event tracking with cron-based backup
│   ├── updateFilesOnDisk.js         # Git operations: clone, fetch, checkout, cleanup
│   ├── getRepoBranchCommitMapping.js# GitHub API call to get latest commit SHA
│   ├── githubAppConnection.js       # GitHub App auth token management (@octokit/auth-app)
│   ├── backupDBTables.js            # Read/write JSON backup files (./backup/)
│   └── logger.js                    # Verbosity-controlled logger (0=silent..4=debug)
├── datasets/                        # Git working trees: owner/repo/branch/
├── backup/                          # JSON backup files for ACL and dataset control lists
├── events/                          # Event analytics backup files (hourly, daily, weekly, monthly)
├── static/                          # Static files served by koa-static (just a placeholder)
├── test/
│   └── api.test.js                  # Mocha + Supertest + Chai integration tests
└── load-testing/
    └── browser-based.js             # k6 browser-based load test
```

---

## Key Source Files

### index.js (Entry Point)
- Loads `.env` via dotenv
- Creates Koa app with middleware: CORS → JWT (optional, passthrough) → routes → compress → koa-static (serves `./datasets/` for asset files)
- Calls `loadAllDatasets()` at startup (loads dataset control list, ACL, clones repos if missing, creates reader instances)
- Memory watchdog: checks heap every 60s, reloads all datasets if >90%
- Graceful shutdown on SIGINT, SIGTERM, SIGHUP, SIGUSR2, uncaught exceptions

### api.js (Route Definitions)
All routes are defined in `initRoutes(api)`. Key routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/status` | GET | Server health: uptime, memory, versions |
| `/sync/:slug?/:branch?` | GET | Trigger dataset sync (auth required: editor) |
| `/syncprogress` | GET | Check sync progress |
| `/synconly/acl` | GET | Refresh ACL only (auth required: editor) |
| `/synconly/dcl` | GET | Refresh dataset control list only (auth required: editor) |
| `/info/:slug?/:branch?/:commit?` | GET | Dataset metadata (auth required: reader for private) |
| `/v2/:slug/:branch?/:commit?/assets/:asset` | GET | Serve dataset assets (redirects to static path) |
| `/v2/:slug/:branch?/:commit?` | GET | **Main data endpoint** — DDF query via URLON |
| `/:slug/:branch?/:commit?` | GET | **Deprecated v1 API** (same as v2, to be removed in v3) |
| `/events` | GET | List recorded events |
| `/backupevents/:filename?` | GET | Backup events to disk |
| `/resetevents` | GET | Reset all events (backs up first) |

**Data query flow:**
1. Client requests `/v2/{slug}?{urlon_query}`
2. `redirectLogic` validates slug → resolves branch → resolves commit → redirects until fully resolved (302s with cache)
3. Once slug/branch/commit are all known, the URLON query is parsed and passed to `DDFCsvReader.read(ddfQuery)`
4. Result is transformed by `resultTransformer` into `{header: [...], rows: [[...], ...], version: "..."}`
5. Response is cacheable (`s-maxage=31536000, max-age=14400`)

**Redirect pattern:** The URL scheme `/{slug}/{branch}/{commit}?{query}` enables long-term CDN caching. When branch or commit are missing/unknown, the server issues 302 redirects to the canonical URL with the resolved default branch and latest commit hash (first 7 chars). The final resolved URL is stable and cache-safe.

### api-redirect-logic.js
Central function `redirectLogic({params, queryString, type, user, ...})` handles:
- Dataset existence and ACL checks
- Branch/commit resolution with 302 redirects
- Error formatting with known error codes
- Cache-Control header selection (error=no-store, redirect=5min, success=1year)
- Calls the route-specific `callback` only when all parameters are resolved

### datasetManagement.js
- **`loadAllDatasets()`** — startup: fetches DCL + ACL, cleans up stale directories, clones/loads all datasets
- **`syncDatasetsIfNotAlreadySyncing(slug, branch, user)`** — triggered by `/sync` route; guards against concurrent syncs; fetches latest commit from GitHub, pulls if needed, reloads reader
- **`datasetVersionReaderInstances`** — `{slug: {branch: DDFCsvReaderInstance}}` — in-memory reader instances
- **`datasetBranchCommitMapping`** — `{slug: {branch: commitHash}}` — tracks which commit each branch points to
- **`syncStatus`** — `{ongoing: bool, events: [...]}` — live sync progress

### datasetControl.js
Fetches the list of allowed datasets from either:
1. **Google Spreadsheet** (CSV export) — uses `ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID` or `..._PUBLISH_ON_WEB_ID`
2. **Supabase DB** — `waffle` table via REST API with service role key

Each dataset entry: `{slug, githubRepoId, branches[], default_branch, is_private, waffleFetcherAppInstallationId}`

Falls back to `backup/datasetControlList.backup.json` if the remote source fails. Saves a backup after each successful fetch.

Uses `SERVER_ID` env var to filter datasets — only loads rows where `server` column matches or equals `"__all__"`.

### accessControl.js
Two ACL maps loaded from Supabase:
- **`accessControlListLookup`** — Map keyed by `"user_uuid.scope.resource"` → level (`owner`|`editor`|`reader`)
- **`permalinkAccessControlListLookup`** — Map keyed by `"token_hash.scope.resource"` → level

Scopes: `server` (whole-server access) or `dataset` (per-dataset access).

`checkServerAccess(user, atLeast)` — checks if user has at least the given level on the current server.
`checkDatasetAccess({sub, permalinkToken}, datasetSlug, atLeast)` — checks user UUID or permalink token against dataset ACL.

Falls back to JSON backup files if Supabase is unreachable.

### resultTransformer.js
Transforms DDFCsvReader's array-of-objects output into `{header: [...], rows: [[...], ...]}` format. Converts `Date` objects to UTC year numbers and booleans to 0/1. This is the main output format for all data queries.

**Limitation:** Only serves years (not full dates).

### event-analytics.js
In-memory event tracking: each unique request (hashed by type+slug+branch+query+referer) gets a counter, timing average, and first/last timestamps. Events are backed up via cron:
- Hourly, daily (23:59), weekly (Mon 01:01), monthly (1st 01:02)
- Stored in `./events/` as JSON

### updateFilesOnDisk.js
Git operations using `isomorphic-git`:
- `cleanupAllDirectories()` — removes owner/repo/branch dirs that aren't in the current DCL
- `ensurePathExistsAndRepoIsCloned()` — shallow clone (`depth: 1`) if `datapackage.json` not present
- `ensureLatestCommit()` — fetch + checkout if local commit differs from remote
- Delegates heavy operations to the sidecar process via HTTP; falls back to main-thread git if sidecar is unavailable

### githubAppConnection.js
Manages GitHub App installation tokens via `@octokit/auth-app`. Caches tokens and reuses until 5min before expiration. Supports a pre-provided token via env vars (`WAFFLE_FETCHER_APP_TOKEN`). Falls back to `GITHUB_TOKEN` (classic PAT) for public repos.

### logger.js
Simple verbosity-controlled logger: `VERBOSITY` env var (0=errors only, 1=+errors, 2=+info, 3=+log, 4=+debug).

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | No (default 3333) | API server port |
| `SIDECAR_PORT` | No (PORT+1) | Git-ops sidecar port |
| `SIDECAR_SECRET` | Yes (prod) | Shared secret for sidecar auth |
| `VERBOSITY` | No (default 2) | Log level 0-4 |
| `SERVER_ID` | Yes | Identifies this server instance in DCL/ACL |
| `GITHUB_TOKEN` | For public repos | Classic GitHub PAT |
| `WAFFLE_FETCHER_APP_ID` | For private repos | GitHub App ID |
| `WAFFLE_FETCHER_APP_INSTALLATION_ID` | For private repos | Default GitHub App installation ID |
| `WAFFLE_FETCHER_APP_PRIVATE_KEY_PATH` | For private repos | Path to GitHub App private key PEM |
| `WAFFLE_FETCHER_APP_TOKEN` | Optional | Pre-provided GitHub token (recycled) |
| `WAFFLE_FETCHER_APP_TOKEN_EXPIRESAT` | With above | Expiration ISO string |
| `GET_ALLOWED_DATASETS_FROM` | Yes | `supabase_db` or `google_spreadsheet` |
| `ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID` | If Google | Spreadsheet ID |
| `ALLOWED_DATASETS_GOOGLE_SPREADSHEET_PUBLISH_ON_WEB_ID` | Alt Google | Published-to-web spreadsheet ID |
| `SUPABASE_JWT_SECRET` | For auth | Decodes JWT tokens from clients |
| `SUPABASE_SERVICE_ROLE_KEY` | For Supabase | Service role key (bypasses RLS) |
| `SUPABASE_ENDPOINT` | For Supabase | e.g. `project_id.supabase.co` |
| `NODE_ENV` | For tests | Set to `test` to enable test user injection |
| `EVENTFILENAME` | Optional | Override event backup filename |

---

## Authentication & Authorization

- **JWT:** Koa-jwt middleware decodes Supabase JWT from `Authorization: Bearer` header (`passthrough: true` — unauthenticated requests proceed, `ctx.state.user` is just empty)
- **Permalink tokens:** `x-share-token` header, checked against `acl_links` table
- **Access levels:** `owner` > `editor` > `reader`
- **Server-level ACL:** Controls who can view `/info`, trigger `/sync`, refresh `/synconly/acl|dcl`
- **Dataset-level ACL:** Controls who can query private datasets; public datasets are open to anyone
- **Test mode:** When `NODE_ENV=test`, user is injected from `x-test-user-sub` and `x-test-user-email` headers

---

## Data Flow: Dataset Lifecycle

1. **Startup:** `loadAllDatasets()` → fetch DCL → fetch ACL → for each dataset/branch: ensure cloned → create `DDFCsvReader` instance → store in `datasetVersionReaderInstances`
2. **Query time:** URL → `redirectLogic` (resolve slug/branch/commit, check ACL) → `readerInstance.read(ddfQuery)` → `resultTransformer` → JSON response
3. **Sync:** `/sync/:slug?/:branch?` → fetch latest commit SHA from GitHub API → `git fetch` + `git checkout` via sidecar → reload reader instance
4. **Assets:** `/v2/:slug/:branch/:commit/assets/:asset` → redirect to `/:owner/:repo/:branch/assets/:asset` → served by koa-static from `./datasets/`

---

## Testing

```bash
npm test
```

Uses Mocha + Supertest + Chai. Tests require actual dataset files in `./datasets/` (test datasets: `_dummy` = `vizabi/ddf--test--companies`, `_dummy-private` = `vizabi/ddf--test--population`). Tests run against the real Koa app with injected test users (reader, editor, owner UUIDs hardcoded in test file and ACL).

Test coverage: status, sync auth, info (redirects, auth, success), assets (redirects, PNG, JSON, missing), data queries (entities, 2D/3D/4D datapoints, bomb queries, DDFCSV validation errors, 500 errors), events.

---

## URL Query Format

Queries use [URLON](https://www.npmjs.com/package/urlon) v2.1.0 encoding of [DDFQL](https://open-numbers.github.io/ddf.html) (DDF Query Language):

```
/v2/{slug}/{branch}/{commit}?{urlon_encoded_ddfql}
```

Example (concepts schema):
```
/v2/fasttrack/master/abc1234?_select_key@=key&=value;&value@;;&from=concepts.schema
```

URLON uses `@` for arrays, `&` as separator, `;` as array/object close, `_` as quote prefix. Slashes in concept names are encoded as `/_`.

---

## Caching Strategy

| Response type | Cache-Control |
|---------------|---------------|
| Errors | `no-store, max-age=0` |
| Redirects (302) | `public, s-maxage=300, max-age=300` |
| Data (200) | `public, s-maxage=31536000, max-age=14400` |
| Static assets | `public, s-maxage=31536000, max-age=14400` |

The commit hash in the URL ensures cache-busting when data changes. Redirects (which resolve branch→commit) have short cache TTL.

---

## Production Deployment

- PM2 manages both processes (`npm run serve`)
- Main API: 6GB heap limit, auto-restart on crash or >6100MB
- Sidecar: 1500MB limit, single instance (avoids `.git` lock conflicts)
- Logs: `/home/gapminder/logs/` (configured in pm2.config.cjs)
- Typically fronted by nginx + Cloudflare CDN
