import fetch from 'node-fetch';
import csv from 'csv-parser';
import Log from "./logger.js"

export let allowedDatasets = [];
// looks like this = [
//   {slug: "fasttrack", id: "open-numbers/ddf--gapminder--fasttrack"},
//   {slug: "billy-master", id: "open-numbers/ddf--gapminder--billionaires"},
// ]

export async function updateAllowedDatasets() {
  if (
    process.env.GET_ALLOWED_DATASETS_FROM === "supabase_db"
    && process.env.SUPABASE_SERVICE_ROLE_KEY 
    && process.env.SUPABASE_ENDPOINT
  )
    return updateAllowedDatasetsFromSupabaseDb();
  else if (
    process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID
  )
    return updateAllowedDatasetsFromGoogleSpreadsheet();
  else {
    Log.error(".env file is not configured correctly");
  }
}


async function updateAllowedDatasetsFromGoogleSpreadsheet() {
  const spreadsheetId = process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

  Log.info(`Updating allowed datasets from a google spreadsheet`, csvUrl.replace("/export?format=csv", ""))
  const response = await fetch(csvUrl);

  if (!response.ok)
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);

  allowedDatasets = [];
  return new Promise((resolve, reject) => {
    response.body
      .pipe(csv())
      .on('data', (row) => {
        row.branches = row.branches.split(",").map(m => m.trim());
        allowedDatasets.push(row);
      })
      .on('end', () => resolve(allowedDatasets))
      .on('error', (err) => reject(err));
  });
}


async function updateAllowedDatasetsFromSupabaseDb() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating allowed datasets from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/waffle`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase dataset table: ${response.statusText}`);

  const rows = await response.json();

  allowedDatasets = rows.map(m => ({
    slug: m.id,
    id: m.github_repo_id,
    branches: m.branches.split(",").map(s => s.trim()),
    default_branch: m.default_branch,
    is_private: m.is_private
  }));


  return Promise.resolve(allowedDatasets);

}


