/**
 * One-time migration: import events/hourly.json (or another JSON backup) into the SQLite DB.
 *
 * Usage:
 *   node scripts/migrate-events-to-sqlite.js [path/to/backup.json]
 *
 * Default source: events/hourly.json
 * Default target: events/events.db
 *
 * Safe to re-run: uses INSERT OR IGNORE so existing rows are not overwritten.
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const sourceFile = process.argv[2] ?? path.resolve('./events/hourly.json');
const targetDb   = path.resolve('./events/events.db');

if (!existsSync(sourceFile)) {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(1);
}

console.log(`Reading ${sourceFile} ...`);
const entries = JSON.parse(readFileSync(sourceFile, 'utf8'));
console.log(`Loaded ${entries.length} entries.`);

const db = new Database(targetDb);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    hash        TEXT PRIMARY KEY,
    type        TEXT,
    datasetSlug TEXT,
    branch      TEXT,
    queryString TEXT,
    referer     TEXT,
    status      INTEGER,
    comment     TEXT,
    "commit"    TEXT,
    count       INTEGER NOT NULL DEFAULT 1,
    earliest_ms INTEGER,
    latest_ms   INTEGER,
    timing      REAL,
    asset       TEXT,
    stack       TEXT
  )
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO events
      (hash, type, datasetSlug, branch, queryString, referer, status, comment, "commit", count, earliest_ms, latest_ms, timing, asset, stack)
  VALUES
    (@hash, @type, @datasetSlug, @branch, @queryString, @referer, @status, @comment, @commit, @count, @earliest_ms, @latest_ms, @timing, @asset, @stack)
`);

const insertMany = db.transaction((rows) => {
  let inserted = 0;
  for (const [hash, record] of rows) {
    const result = insert.run({
      hash,
      type:        record.type        ?? null,
      datasetSlug: record.datasetSlug ?? null,
      branch:      record.branch      ?? null,
      queryString: record.queryString ?? null,
      referer:     record.referer     ?? null,
      status:      record.status      ?? null,
      comment:     record.comment     ?? null,
      commit:      record.commit      ?? null,
      count:       record.count       ?? 1,
      earliest_ms: record.earliest_ms ?? null,
      latest_ms:   record.latest_ms   ?? null,
      timing:      record.timing      ?? null,
      asset:       record.asset       ?? null,
      stack:       record.stack       ?? null,
    });
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

console.log('Inserting rows...');
const inserted = insertMany(entries);
const total = db.prepare('SELECT COUNT(*) as n FROM events').get().n;

console.log(`Done. Inserted ${inserted} new rows (${entries.length - inserted} already existed). DB now has ${total} rows.`);
console.log(`Target: ${targetDb}`);
db.close();
