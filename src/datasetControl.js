import fetch from 'node-fetch';
import csv from 'csv-parser';
import Log from "./logger.js"

export let datasetControlList = [];
// looks like this = [
//   {slug: "fasttrack", githubRepoId: "open-numbers/ddf--gapminder--fasttrack"},
//   {slug: "billy-master", githubRepoId: "open-numbers/ddf--gapminder--billionaires"},
// ]

export async function updateDatasetControlList() {
  if (
    process.env.GET_ALLOWED_DATASETS_FROM === "supabase_db"
    && process.env.SUPABASE_SERVICE_ROLE_KEY 
    && process.env.SUPABASE_ENDPOINT
  )
    return updateDatasetControlListFromSupabaseDb();
  else if (
    process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID
  )
    return updateDatasetControlListFromGoogleSpreadsheet();
  else {
    Log.error(".env file is not configured correctly");
  }
}


async function updateDatasetControlListFromGoogleSpreadsheet() {
  const spreadsheetId = process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

  Log.info(`Updating allowed datasets from a google spreadsheet`, csvUrl.replace("/export?format=csv", ""))
  const response = await fetch(csvUrl);

  if (!response.ok)
    throw new Error(`Failed to fetch CSV: ${response.statusText}`);

  datasetControlList = [];
  return new Promise((resolve, reject) => {
    response.body
      .pipe(csv())
      .on('data', (row) => {
        datasetControlList.push({
          slug: row.id,
          githubRepoId: row.github_repo_id,
          branches: row.branches.split(",").map(s => s.trim()),
          default_branch: row.default_branch,
          is_private: row.is_private.trim() === "FALSE" ? false : (row.is_private.trim() === "TRUE" || null),
          waffleFetcherAppInstallationId: row.waffle_fetcher_app_installation_id,
        });
      })
      .on('end', () => resolve(datasetControlList))
      .on('error', (err) => reject(err));
  });
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
  });

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


  return Promise.resolve(datasetControlList);

}


