import { retrieveEvents, retrieveEventFacets, backupEvents, resetEvents } from "./event-analytics.js";
import { checkServerAccess } from "./accessControl.js";
import Log from "./logger.js";

export default function initEventRoutes(api) {

  /*
  * GET /events
  * Returns recorded events as a JSON array of [hash, record] pairs.
  *
  * Query parameters (all optional, combinable):
  *   type           — filter by event type: "query" or "asset"
  *   datasetSlug    — filter by dataset slug, e.g. "fasttrack" or "_dummy"
  *   branch         — filter by branch name, e.g. "master" or "main"
  *   status         — filter by HTTP status code, e.g. 200, 400, 500
  *   comment        — filter by exact comment string, e.g. "Resolved query"
  *   asset          — filter by asset filename (for type=asset events)
  *   orderBy        — sort column with optional direction: "<col>:<asc|desc>"
  *                    sortable columns: count, earliest_ms, latest_ms, timing,
  *                    status, type, datasetSlug, branch, comment, asset
  *                    default: count:desc
  *   from_latest_ms — include only events where latest_ms >= this value (Unix ms)
  *   to_latest_ms   — include only events where latest_ms <= this value (Unix ms)
  *   limit          — maximum number of rows to return (default: 1000)
  *
  * Examples:
  *   /events?status=500
  *   /events?datasetSlug=fasttrack&status=400&orderBy=latest_ms:desc&limit=50
  *   /events?type=query&comment=Resolved%20query&orderBy=count:desc&limit=20
  *   /events?from_latest_ms=1746748800000&to_latest_ms=1746835200000
  *
  * Requires: server-level "reader" access
  */
  api.get("/events", async (ctx, next) => {
    Log.debug("Received a request to list all events");
    const user = ctx.state.user;
    if (!checkServerAccess(user, "reader")) {
      ctx.set('Cache-Control', "no-store, max-age=0");
      ctx.throw(401, "Unauthorized");
      return;
    }
    ctx.set('Cache-Control', "no-store, max-age=0");
    ctx.status = 200;
    ctx.body = JSON.stringify(retrieveEvents(ctx.query));
  });

  /*
  * GET /events/facets
  * Returns distinct values and counts for each filterable column.
  * Use this to populate filter dropdowns in a UI.
  *
  * Response shape:
  *   {
  *     _total:      { uniqueEvents: number, totalCount: number },
  *     type:        [{ value, totalCount, uniqueEvents }, ...],
  *     datasetSlug: [{ value, totalCount, uniqueEvents }, ...],
  *     branch:      [{ value, totalCount, uniqueEvents }, ...],
  *     status:      [{ value, totalCount, uniqueEvents }, ...],
  *     comment:     [{ value, totalCount, uniqueEvents }, ...],
  *     asset:       [{ value, totalCount, uniqueEvents }, ...]
  *   }
  *
  * Each entry is sorted by totalCount descending.
  * totalCount = sum of the count field (total times this value was seen)
  * uniqueEvents = number of distinct event records with this value
  *
  * Query parameters (optional):
  *   from_latest_ms — restrict facet counts to events where latest_ms >= this value
  *   to_latest_ms   — restrict facet counts to events where latest_ms <= this value
  *
  * Requires: server-level "reader" access
  */
  api.get("/events/facets", async (ctx, next) => {
    Log.debug("Received a request for event facets");
    const user = ctx.state.user;
    if (!checkServerAccess(user, "reader")) {
      ctx.set('Cache-Control', "no-store, max-age=0");
      ctx.throw(401, "Unauthorized");
      return;
    }
    ctx.set('Cache-Control', "no-store, max-age=0");
    ctx.status = 200;
    ctx.body = JSON.stringify(retrieveEventFacets(ctx.query));
  });

  /*
  * GET /backupevents[/:filename]
  * Triggers a timestamped JSON backup of all events to the ./events/ directory.
  *
  * Route params:
  *   filename — base name for the backup file (default: "manual-backup")
  *              saved as events/<filename>_<YYYY-MM-DDThh-mm-ss>.json
  *
  * Requires: server-level "reader" access
  */
  api.get("/backupevents{/:filename}", async (ctx, next) => {
    Log.debug("Received a request to backup events");
    const user = ctx.state.user;
    if (!checkServerAccess(user, "reader")) {
      ctx.set('Cache-Control', "no-store, max-age=0");
      ctx.throw(401, "Unauthorized");
      return;
    }
    let filename = ctx.params.filename || "manual-backup";
    ctx.set('Cache-Control', "no-store, max-age=0");
    ctx.status = 200;
    const backupStatus = await backupEvents({filename, timestamp: true});
    ctx.body = JSON.stringify(backupStatus);
  });

  /*
  * GET /resetevents
  * Clears all events from the database after saving a timestamped backup.
  * Also overwrites the hourly backup with the now-empty state.
  *
  * Requires: server-level "reader" access
  */
  api.get("/resetevents", async (ctx, next) => {
    Log.debug("Received a request to reset all events");
    const user = ctx.state.user;
    if (!checkServerAccess(user, "owner")) {
      ctx.set('Cache-Control', "no-store, max-age=0");
      ctx.throw(401, "Unauthorized");
      return;
    }
    ctx.set('Cache-Control', "no-store, max-age=0");
    ctx.status = 200;
    const resetStatus = await resetEvents();
    ctx.body = JSON.stringify(resetStatus);
  });

}
