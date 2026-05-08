import crypto from 'crypto';
import Database from 'better-sqlite3';
import Log from "./logger.js";
import {promises as fs, existsSync, mkdirSync} from 'fs';
import path from 'path';
import cron from 'node-cron';

const backupFilePath = path.resolve("./events/");

// Use in-memory DB for the test environment; otherwise a persistent file.
const dbName = process.env.EVENTFILENAME ?? "events";
const isTestEnv = dbName === "test";
const dbFilePath = isTestEnv ? ":memory:" : path.join(backupFilePath, `${dbName}.db`);

let db = null;
let stmtUpsert = null;
let stmtGet = null;
let stmtAll = null;

function createMD5Hash(input) {
    const hash = crypto.createHash('md5');
    hash.update(input);
    return hash.digest('hex');
}

function key({type="", asset="", datasetSlug="", branch="", queryString="", referer=""} = {}){
    return createMD5Hash(`${type} ${asset} ${datasetSlug} ${branch} ${queryString} ${referer}`);
}

function logstring({status, type, asset, datasetSlug, branch, commit, queryString, referer, comment, timing}){
    const branchText = branch? "/"+branch : "";
    const commitText = commit? "/"+commit : "";
    const queryText = queryString? "?"+queryString : "";
    const statusText = status? status + " --- " : "";
    return type === "asset" 
        ? `${statusText}${comment} --- ${datasetSlug}${branchText}${commitText}/assets/${asset} --- ref: ${referer} `
        : `${statusText}${comment}${timingText(timing)} --- ${datasetSlug}${branchText}${commitText}${queryText} --- ref: ${referer}`;
}

function timingText(timing){
  return timing? " in " + Math.round(timing) + "ms" : "";
}

function getLogLevel(status, newEvent){
    if (!status || status === 200 || status === 302)
        return newEvent ? "info" : "debug";
    return newEvent ? "error" : "debug";
}

function log(params, count){
    const text = count === 0 
        ? `NEW EVENT: ${logstring(params)}` 
        : `FAMILIAR EVENT (${count}): ${params.status} --- ${params.comment}${timingText(params.timing)}`;
    const logger = Log[getLogLevel(params.status, count === 0)];
    if (params.stack) 
        logger(text, params.stack);
    else
        logger(text);
}

function ensurePathExists(){
  if (!existsSync(backupFilePath)) mkdirSync(backupFilePath, { recursive: true });
}

function prepareStatements() {
  stmtUpsert = db.prepare(`
    INSERT INTO events
      (hash, type, datasetSlug, branch, queryString, referer, status, comment, "commit", count, earliest_ms, latest_ms, timing, asset, stack)
    VALUES
      (@hash, @type, @datasetSlug, @branch, @queryString, @referer, @status, @comment, @commit, 1, @now_ms, @now_ms, @timing, @asset, @stack)
    ON CONFLICT(hash) DO UPDATE SET
      count      = count + 1,
      latest_ms  = @now_ms,
      timing     = CASE
                     WHEN timing IS NOT NULL AND @timing IS NOT NULL
                     THEN ROUND((timing * count + @timing) / (count + 1))
                     ELSE timing
                   END
    RETURNING count
  `);
  stmtGet = db.prepare(`SELECT * FROM events WHERE hash = ?`);
  stmtAll = db.prepare(`SELECT * FROM events`);
}

export function recordEvent(params = {}){
    const k = key(params);
    const now_ms = Date.now();
    const {type, asset, datasetSlug, branch, queryString, referer, status, comment, commit, timing, stack} = params;

    const result = stmtUpsert.get({
        hash: k, type, asset: asset ?? null, datasetSlug, branch, queryString,
        referer: referer ?? null, status, comment, commit: commit ?? null,
        now_ms, timing: timing ?? null, stack: stack ?? null
    });

    const count = result.count;
    log(params, count === 1 ? 0 : count);
    return count;
}

const ALLOWED_FILTER_COLUMNS = new Set([
    'type', 'datasetSlug', 'branch', 'status', 'comment', 'asset'
]);
const ALLOWED_ORDER_COLUMNS = new Set([
    'count', 'earliest_ms', 'latest_ms', 'timing', 'status',
    'type', 'datasetSlug', 'branch', 'comment', 'asset'
]);

export function retrieveEvents(filters = {}){
    const conditions = [];
    const bindings = {};
    let orderClause = 'ORDER BY count DESC';
    let limitClause = 'LIMIT 1000';

    for (const [key, value] of Object.entries(filters)) {
        if (key === 'limit') {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) limitClause = `LIMIT ${n}`;
            continue;
        }
        if (key === 'orderBy') {
            const [col, dir] = value.split(':');
            const direction = dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            if (ALLOWED_ORDER_COLUMNS.has(col)) {
                orderClause = `ORDER BY "${col}" ${direction}`;
            }
            continue;
        }
        if (key === 'from_latest_ms') {
            const n = parseInt(value, 10);
            if (!isNaN(n)) { conditions.push(`latest_ms >= @from_latest_ms`); bindings.from_latest_ms = n; }
            continue;
        }
        if (key === 'to_latest_ms') {
            const n = parseInt(value, 10);
            if (!isNaN(n)) { conditions.push(`latest_ms <= @to_latest_ms`); bindings.to_latest_ms = n; }
            continue;
        }
        if (ALLOWED_FILTER_COLUMNS.has(key)) {
            conditions.push(`"${key}" = @${key}`);
            bindings[key] = value;
        }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM events ${where} ${orderClause} ${limitClause}`;
    return db.prepare(sql).all(bindings).map(({hash, ...record}) => [hash, record]);
}

export function retrieveEventFacets(filters = {}){
    const conditions = [];
    const bindings = {};

    if (filters.from_latest_ms) {
        const n = parseInt(filters.from_latest_ms, 10);
        if (!isNaN(n)) { conditions.push(`latest_ms >= @from_latest_ms`); bindings.from_latest_ms = n; }
    }
    if (filters.to_latest_ms) {
        const n = parseInt(filters.to_latest_ms, 10);
        if (!isNaN(n)) { conditions.push(`latest_ms <= @to_latest_ms`); bindings.to_latest_ms = n; }
    }

    const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const facets = {};
    for (const col of ALLOWED_FILTER_COLUMNS) {
        const colWhere = baseWhere
            ? `${baseWhere} AND "${col}" IS NOT NULL`
            : `WHERE "${col}" IS NOT NULL`;
        const sql = `
            SELECT "${col}" as value, SUM(count) as totalCount, COUNT(*) as uniqueEvents
            FROM events
            ${colWhere}
            GROUP BY "${col}"
            ORDER BY totalCount DESC
        `;
        facets[col] = db.prepare(sql).all(bindings);
    }
    const totalSql = `SELECT COUNT(*) as uniqueEvents, SUM(count) as totalCount FROM events ${baseWhere}`;
    facets._total = db.prepare(totalSql).get(bindings);
    return facets;
}

export function retrieveEvent(params){
    const row = stmtGet.get(key(params));
    if (!row) return undefined;
    const {hash, ...record} = row;
    return record;
}

export async function backupEvents({filename = "backup", timestamp = false} = {}) {
  ensurePathExists();
  const dateFormat = () => new Date().toISOString().slice(0,19).replaceAll(":","-");
  const fileName = path.join(backupFilePath, `${filename}${timestamp ? "_" + dateFormat() : ""}.json`);

  try {
    const entries = stmtAll.all().map(({hash, ...record}) => [hash, record]);
    await fs.writeFile(fileName, JSON.stringify(entries));
    const status = `Event backup with ${entries.length} events saved successfully to ${fileName}.`;
    Log.info(status);
    return ({status});
  } catch (error) {
    Log.error('Failed to save event backup:', error);
    return ({status: `Failed to save event backup`});
  }
}

// Called at startup. Opens/creates the SQLite DB and prepares statements.
// In the test environment uses an in-memory DB (EVENTFILENAME=test).
export async function loadEventsFromFile(){
  if (!isTestEnv) ensurePathExists();
  db = new Database(dbFilePath);
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
  prepareStatements();
  const count = db.prepare('SELECT COUNT(*) as n FROM events').get().n;
  Log.info(`Database initialized with ${count} events from ${isTestEnv ? ":memory:" : dbFilePath}`);
}

export async function resetEvents() {
  const backupStatus = await backupEvents({filename: "before-reset", timestamp: true});
  let status = "";
  if (backupStatus.status.includes("success")) {
    db.prepare('DELETE FROM events').run();
    await backupEvents({filename: "hourly", timestamp: false});
    status = `Successfully purged all events and erased the hourly backup file`;
  } else {
    status = `Failed to purge all events`;
  }
  Log.info(status);
  return({status});
}

// Every hour at minute 0
cron.schedule('0 * * * *', () => backupEvents({filename: "hourly"}));

// Every day at 23:59
cron.schedule('59 23 * * *', () => backupEvents({filename: "daily"}));

// At 01:01 AM, only on Monday
cron.schedule('1 1 * * 1', () => backupEvents({filename: "weekly"}));

// At 01:02 AM, on day 1 of the month
cron.schedule('2 1 1 * *', () => backupEvents({filename: "monthly"}));