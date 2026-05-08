/**
 * One-time migration: normalize mangled query_from values.
 *
 * Allowed values: datapoints, entities, concepts,
 *                 entities.schema, concepts.schema, datapoints.schema
 *
 * Mangling patterns seen in the wild:
 *   - URL-encoded ampersands with trailing URLON params  e.g. datapoints%26select → datapoints
 *   - Slash before .schema                               e.g. datapoints/.schema  → datapoints.schema
 *   - Encoded wildcard                                   e.g. %2A.schema          → null (not in allowed set)
 *
 * Usage:
 *   node scripts/normalize-query-from.js [path/to/events.db]
 *
 * Default target: events/events.db
 */

import Database from 'better-sqlite3';
import path from 'path';

const ALLOWED = new Set([
  'datapoints',
  'entities',
  'concepts',
  'entities.schema',
  'concepts.schema',
  'datapoints.schema',
  '*.schema',
]);

function normalizeQueryFrom(raw) {
  if (!raw) return null;

  // URL-decode (%26 → &, %2A → *, %3D → =, etc.)
  let val;
  try {
    val = decodeURIComponent(raw);
  } catch {
    val = raw;
  }

  // Strip leftover URLON params that got included after the from value
  const ampIdx = val.indexOf('&');
  if (ampIdx !== -1) val = val.slice(0, ampIdx);

  // Normalize datapoints/.schema → datapoints.schema
  val = val.replace(/\/\.schema$/, '.schema');

  return ALLOWED.has(val) ? val : null;
}

const dbPath = process.argv[2] ?? path.resolve('./events/events.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Only process rows where query_from is set but not already a known-good value
const placeholders = [...ALLOWED].map(() => '?').join(', ');
const rows = db.prepare(
  `SELECT hash, query_from FROM events WHERE query_from IS NOT NULL AND query_from NOT IN (${placeholders})`
).all(...ALLOWED);

console.log(`Found ${rows.length} rows with non-canonical query_from values.`);

// Show what we'll change before committing
const preview = {};
for (const { hash, query_from } of rows) {
  const normalized = normalizeQueryFrom(query_from);
  const key = `${query_from} → ${normalized ?? 'NULL'}`;
  preview[key] = (preview[key] ?? 0) + 1;
}
console.log('Changes preview:');
for (const [label, count] of Object.entries(preview)) {
  console.log(`  ${count}x  ${label}`);
}

if (rows.length === 0) {
  console.log('Nothing to do.');
  db.close();
  process.exit(0);
}

const update = db.prepare(`UPDATE events SET query_from = ? WHERE hash = ?`);

const migrate = db.transaction(() => {
  let updated = 0;
  for (const { hash, query_from } of rows) {
    const normalized = normalizeQueryFrom(query_from);
    update.run(normalized, hash);
    updated++;
  }
  return updated;
});

const updated = migrate();
console.log(`Updated ${updated} rows.`);
db.close();
