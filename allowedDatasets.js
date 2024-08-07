import fetch from 'node-fetch';
import csv from 'csv-parser';
import Log from "./logger.js"

export let allowedDatasets = [];
// looks like this = [
//   {slug: "fasttrack", id: "open-numbers/ddf--gapminder--fasttrack"},
//   {slug: "billy-master", id: "open-numbers/ddf--gapminder--billionaires"},
// ]

const spreadsheetId = process.env.ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID;
const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

export async function updateAllowedDatasets() {
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
