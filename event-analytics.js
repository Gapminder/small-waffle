// Importing the crypto module with ES6 syntax
import crypto from 'crypto';
import Log from "./logger.js";
import {promises as fs, existsSync, mkdirSync} from 'fs';
import path from 'path';
import cron from 'node-cron';
let requestMap = new Map();

// Function to create an MD5 hash
function createMD5Hash(input) {
    const hash = crypto.createHash('md5');
    hash.update(input);
    return hash.digest('hex');
}

function key({type="", asset="", datasetSlug="", branchOrCommit="", queryString="", referer=""} = {}){
    return createMD5Hash(`${type} ${asset} ${datasetSlug} ${branchOrCommit} ${queryString} ${referer}`);
}

function logstring({status, type, asset, datasetSlug, branchOrCommit, queryString, referer, comment}){
    const branch = branchOrCommit? "/"+branchOrCommit : "";
    const query = queryString? "?"+queryString : "";
    return type === "asset" 
        ? `${status} --- ${comment} --- ${datasetSlug}${branch}/assets/${asset} --- ref: ${referer} `
        : `${status} --- ${comment} --- ${datasetSlug}${branch}${query} --- ref: ${referer}`;
}

function getLogLevel(status, newEvent){
    if (status === 200 || status === 302)
        return newEvent ? "info" : "debug";
    
    return newEvent ? "error" : "debug";
}

function log(params, count){
    const text = count === 0 
        ? `NEW EVENT: ${logstring(params)}` 
        : `FAMILIAR EVENT (${count}): ${params.status} --- ${params.comment}`;
    const logger = Log[getLogLevel(params.status, count === 0)];
    if (params.stack) 
        logger(text, params.stack);
    else
        logger(text);
}

export function recordEvent(params = {}){

    const k = key(params);
    const now = new Date();
    const now_ms = now.valueOf();
    const record = requestMap.get(k);
    
    if(!record) {
        requestMap.set(k, {...params, count: 1, earliest_ms: now_ms, latest_ms: now_ms});
        log(params, 0);
        return 1;
    } else {
        record.count = record.count + 1;
        record.latest_ms = now_ms;
        log(params, record.count);
        return record.count;
    }
}

export function retrieveEvents(params){
    return requestMap.get(key(params)) || [...requestMap.entries()];
}


const backupFilePath = path.resolve("./events/");
let backupFileLock = false;

async function ensurePathExists(){
  if (!existsSync(backupFilePath)) mkdirSync(backupFilePath, { recursive: true });
}

export async function backupEvents({filename = "backup", date = false} = {}) {
  ensurePathExists();
  const dateFormat = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const fileName = path.join(backupFilePath, `${filename}${date ? "_" + dateFormat() : ""}.json`);

  if (backupFileLock) return;
  try {
    await fs.writeFile( fileName, JSON.stringify([...requestMap.entries()]) );
    const status = `Event backup with ${requestMap.size} events saved successfully to ${fileName}`;
    Log.info(status);
    return ({status})
  } catch (error) {
    Log.error('Failed to save hourly backup:', error);
    return ({status: `Failed to save hourly backup`})
  }
}

export async function loadEventsFromFile({filename = "backup"} = {}){
  if (process.env.EVENTFILENAME) filename = process.env.EVENTFILENAME;
  ensurePathExists();
  backupFileLock = true;
  const fileName = path.join(backupFilePath, `${filename}.json`);
  try {
    const data = await fs.readFile(fileName, { encoding: 'utf8' });
    const entries = JSON.parse(data);
    requestMap = new Map(entries);
    backupFileLock = false;
    Log.info(`Backup loaded successfully wtith ${requestMap.size} events`);
  } catch (error) {
    backupFileLock = false;
    Log.error(`Failed to load event backup from ${fileName}`, error);
  }
}

// Every hour at minute 0
cron.schedule('0 * * * *', () => backupEvents());

// Every day at 23:59
cron.schedule('59 23 * * *', () => backupEvents({date: true}));