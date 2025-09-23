import fetch from 'node-fetch';
import csv from 'csv-parser';
import Log from "./logger.js"
import {readListFromFile, writeListToFile} from './backupDBTables.js'; 

export let datasetControlList = [];

export async function updateDatasetControlList() {
  try {
    if (
      process.env.GET_ALLOWED_DATASETS_FROM === "supabase_db"
      && process.env.SUPABASE_SERVICE_ROLE_KEY 
      && process.env.SUPABASE_ENDPOINT
    )
      await updateDatasetControlListFromSupabaseDb();
    else if (
      process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_PUBLISH_ON_WEB_ID
      || process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID 
    )
      await updateDatasetControlListFromGoogleSpreadsheet();
    else {
      throw new Error(`.env file is not configured correctly`);
    }
  } catch (e) {
    Log.error(e);
    Log.info("⚠️ CAN NOT ACCESS DATASET CONTROL LIST, ATTEMPTING TO RESTORE FROM BACKUP");
    const rows = await readListFromFile('datasetControlList.backup.json');
    if (rows?.length > 0) datasetControlList = rows;
  }
}


async function updateDatasetControlListFromGoogleSpreadsheet() {
  const spreadsheetPublishOnWebId = process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_PUBLISH_ON_WEB_ID;
  const spreadsheetId = process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID;
  const csvUrl = spreadsheetPublishOnWebId 
    ? `https://docs.google.com/spreadsheets/d/e/${spreadsheetPublishOnWebId}/pub?gid=0&single=true&output=csv`
    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;


  Log.info(`Updating allowed datasets from a google spreadsheet`, csvUrl);
  const response = await fetch(csvUrl).catch(e => {throw e});

  if (!response.ok)
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);

  datasetControlList = [];
  // Wrap the stream in an async iterator
  const parser = response.body.pipe(csv());

  for await (const row of parser) {
    datasetControlList.push({
      slug: row.id,
      githubRepoId: row.github_repo_id,
      branches: row.branches.split(",").map(s => s.trim()),
      default_branch: row.default_branch,
      is_private: row.is_private.trim() === "FALSE" ? false : (row.is_private.trim() === "TRUE" || null),
      waffleFetcherAppInstallationId: row.waffle_fetcher_app_installation_id,
    });
  }

  Log.info("Saving DS control list to a backup file");
  await writeListToFile(datasetControlList, 'datasetControlList.backup.json');
  return datasetControlList;
}


async function updateDatasetControlListFromSupabaseDb() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating allowed datasets from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/waffle`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  }).catch(e => {throw e});

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase dataset table: ${response.statusText}`);

  const rows = await response.json();

  datasetControlList = rows.map(row => ({
    slug: row.id,
    githubRepoId: row.github_repo_id,
    branches: row.branches.split(",").map(s => s.trim()),
    default_branch: row.default_branch,
    is_private: row.is_private,
    waffleFetcherAppInstallationId: row.waffle_fetcher_app_installation_id,
  }));

  Log.info("Saving DS control list to a backup file");
  await writeListToFile(datasetControlList, 'datasetControlList.backup.json');
  return datasetControlList;
}


