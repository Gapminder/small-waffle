/**
 * One-time backfill: derive event_code from comment text for rows where event_code IS NULL.
 *
 * Error codes are matched against the comment column using the static prefix of each
 * error message template from api-errors.js. Happy-path codes are matched by exact comment.
 * Unknown errors (stack present or no match) get UNKNOWN_ERROR.
 *
 * Usage:
 *   node scripts/backfill-event-code.js [path/to/events.db]
 *
 * Default target: events/events.db
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] ?? path.resolve('./events/events.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Each entry: [event_code, matchFn]
// Ordered from most specific to least specific.
const CODE_MATCHERS = [
  // Known error codes — prefix match against interpolated message templates
  ["NO_DATASET_GIVEN",           c => c === "Received a request with no dataset provided"],
  ["DATASET_NOT_CONFIGURED",     c => c?.startsWith("Dataset not configured:")],
  ["BRANCH_NOT_CONFIGURED",      c => c?.startsWith("Branch not configured:")],
  ["DATASET_NOT_FOUND",          c => c?.startsWith("Dataset present in config but not correctly synced:")],
  ["SYNC_UNAUTHORIZED",          c => c === "User doesn't have access to sync datasets or needs to login"],
  ["DATASET_UNAUTHORIZED",       c => c?.startsWith("User doesn't have access to the dataset or needs to login:")],
  ["DEFAULT_COMMIT_NOT_RESOLVED",c => c?.startsWith("Server failed to resolve the default commit for dataset")],
  ["NO_READER_INSTANCE",         c => c?.startsWith("No reader instance found for")],
  ["NO_QUERY_PROVIDED",          c => c?.startsWith("No query provided for")],
  ["QUERY_PARSING_ERROR",        c => c?.startsWith("Query failed to parse for")],
  ["ASSET_NOT_PROVIDED",         c => c === "No asset provided in the route"],
  ["VALIDATE_UNAUTHORIZED",      c => c === "User doesn't have access to validate datasets or needs to login"],
  ["VALIDATE_NO_SLUG",           c => c === "Received a validate request with no dataset provided"],

  // ddf-query-validator errors (hardcoded in api-redirect-logic.js)
  ["QUERY_STRUCTURE_ERROR",     c => c?.startsWith("Too many query structure errors")],
  ["QUERY_DEFINITION_ERROR",    c => c?.startsWith("Too many query definition errors")],

  // Happy-path codes
  ["RESOLVED_QUERY",             c => c === "Resolved query"],
  ["SERVING_ASSET",              c => c === "Serving asset from a resolved path"],
  ["BOMB_QUERY_GUARD",           c => c === "Bomb query, empty response"],
];

function deriveEventCode(comment, stack) {
  if (!comment) return stack ? "UNKNOWN_ERROR" : null;
  for (const [code, match] of CODE_MATCHERS) {
    if (match(comment)) return code;
  }
  return "UNKNOWN_ERROR";
}

const rows = db.prepare(`SELECT hash, comment, stack FROM events WHERE event_code IS NULL`).all();
console.log(`Found ${rows.length} rows with null event_code.`);

const update = db.prepare(`UPDATE events SET event_code = ? WHERE hash = ?`);

const backfill = db.transaction(() => {
  const counts = {};
  for (const { hash, comment, stack } of rows) {
    const code = deriveEventCode(comment, stack);
    if (code) {
      update.run(code, hash);
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return counts;
});

const counts = backfill();
const total = Object.values(counts).reduce((s, n) => s + n, 0);
console.log(`Updated ${total} rows:`);
for (const [code, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(6)}  ${code}`);
}
db.close();
