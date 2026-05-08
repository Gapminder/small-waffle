/**
 * One-time backfill: derive query_from from queryString for rows where query_from IS NULL.
 *
 * URLON encodes `from` as:
 *   ;from=<value>   — when it appears after other keys
 *   $from=<value>   — when it is the first (only dollar) key in the object
 *
 * The extracted value is terminated by the next `;` or end-of-string.
 *
 * Usage:
 *   node scripts/backfill-query-from.js [path/to/events.db]
 *
 * Default target: events/events.db
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] ?? path.resolve('./events/events.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function extractFrom(queryString) {
  if (!queryString) return null;
  // Look for ;from= or $from= (start of string variant)
  const markers = [';from=', '$from='];
  for (const marker of markers) {
    const idx = queryString.indexOf(marker);
    if (idx === -1) continue;
    const afterMarker = queryString.slice(idx + marker.length);
    const endIdx = afterMarker.indexOf(';');
    return endIdx === -1 ? afterMarker : afterMarker.slice(0, endIdx);
  }
  return null;
}

const rows = db.prepare(`SELECT hash, queryString FROM events WHERE query_from IS NULL AND queryString IS NOT NULL`).all();
console.log(`Found ${rows.length} rows with null query_from and a queryString.`);

const update = db.prepare(`UPDATE events SET query_from = ? WHERE hash = ?`);

const backfill = db.transaction(() => {
  let updated = 0;
  for (const { hash, queryString } of rows) {
    const from = extractFrom(queryString);
    if (from) {
      update.run(from, hash);
      updated++;
    }
  }
  return updated;
});

const updated = backfill();
console.log(`Updated ${updated} rows.`);
db.close();
