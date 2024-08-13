import * as path from 'path';
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import {resultTransformer} from "./resultTransformer.js";
import {getRepoBranchCommitMapping} from "./getRepoBranchCommitMapping.js";
import {
  getLocalBranchCommitMapping, 
  checkFilesOnDisk,
  updateFilesOnDisk, 
  cleanupAllDirectories
} from "./updateFilesOnDisk.js";
import { updateAllowedDatasets, allowedDatasets } from "./allowedDatasets.js";
import { purgeCloudflareCache } from "./purgeCloudflareCache.js";
import Log from "./logger.js"

const rootPath = path.resolve("./datasets/");



const dummyReaderInstance = (new DDFCsvReader.getDDFCsvReaderObject()).init({
  path: path.join(rootPath, 'ddf--gapminder--fasttrack', 'master'),
  resultTransformer,
})

/**
 * Dataset version reader instances used to serve the data
 * Filled out during GitHub metadata / dataset refresh
 * @type {{[slug]: {[branch]: DDFCsvReader}}}
 */
export const datasetVersionReaderInstances = {
  'slug-dummy': {
    'branch-dummy': dummyReaderInstance
  },
}

export const datasetBranchCommitMapping = {}

export function getBranchFromCommit(datasetSlug, commit) {
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
  for (let [branch, mappedCommit] of Object.entries(branchCommitMapping)) {
    if (mappedCommit === commit || mappedCommit.substr(0,7) === commit) {
      return branch;
    }
  }
  return undefined;
}

export function getAllowedDatasetEntryFromSlug(datasetSlug) {
  const dataset = allowedDatasets.find(f => f.slug === datasetSlug);
  return dataset || false;
}

export function getDefaultCommit(datasetSlug){
  const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
  return dataset && branchCommitMapping ? branchCommitMapping[ dataset.default_branch || dataset.branches[0] ] : false;
}


export async function syncDatasets(datasets) {
  const datasetListString = datasets.length > 0 ? datasets.map(m => m.slug).join(", ") : "";
  Log.info(`Got info about ${datasets.length} datasets: ${datasetListString}`);

  for (const dataset of datasets)
    await syncDataset(dataset.slug);

  Log.info(`
  🟢 Sync complete!
  `);

  return `🟢 Sync complete for ${datasets.length} datasets: ${datasetListString}`;
}

export async function syncAllDatasets() {
  await updateAllowedDatasets();

  cleanupAllDirectories(rootPath, allowedDatasets);
  return syncDatasets(allowedDatasets);
}


export async function loadAllDatasets() {
  await updateAllowedDatasets();
  const datasetListString = allowedDatasets.length > 0 ? allowedDatasets.map(m => m.slug).join(", ") : "";
  Log.info(`Got info about ${allowedDatasets.length} datasets: ${datasetListString}`);

  for (const dataset of allowedDatasets)
    await loadDataset(dataset.slug);

  Log.info(`
  🟢 Load complete! This is not the complete sync. Run /sync to do that.
  `);

  return `🟢 Load complete for ${allowedDatasets.length} datasets: ${datasetListString}`;
}


export async function syncDataset(datasetSlug) {
  Log.info(`
  === Syncing dataset with slug ${datasetSlug} ===
  `);

  const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
  
  if (!dataset) throw new Error(`Syncing error: Dataset not allowed: ${datasetSlug}`);

  const branchCommitMapping = await getRepoBranchCommitMapping(dataset.id, dataset.branches);

  datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;

  try {
    await updateFilesOnDisk(rootPath, dataset.id, branchCommitMapping)
    Log.info('Files on disk updated successfully.');

    await loadReaderInstances(dataset, branchCommitMapping)
    Log.info(`Sync successful for dataset ${datasetSlug}`);

    if (process.env.ENV === 'prod') {
      const urlsToPurge = [`${process.env.BASE_URL}/status/${dataset.slug}`];
      await purgeCloudflareCache(urlsToPurge);
      Log.info(`Cloudflare cache purged for dataset ${datasetSlug}`);
    } else {
      Log.info(`Cloudflare cache not purged for dataset ${datasetSlug} (dev environment)`);
    }

  } catch (err) {
    Log.error('Error syncing dataset:', err);
  }
}

export async function loadDataset(datasetSlug) {
  Log.info(`
  === Loading dataset with slug ${datasetSlug} ===
  `);

  const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
  
  if (!dataset) throw new Error(`Syncing error: Dataset not allowed: ${datasetSlug}`);

  const branchCommitMapping = await getLocalBranchCommitMapping(rootPath, dataset.id, dataset.branches);

  Log.info(branchCommitMapping)

  datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;

  try {
    await checkFilesOnDisk(rootPath, dataset.id, branchCommitMapping)
    Log.info('Files on disk checked successfully.');
  } catch (err) {
    Log.error('Error checking files on disk:', err);
  }
  await loadReaderInstances(dataset, branchCommitMapping)

  Log.info(`Sync successful for dataset ${datasetSlug}`);
  return(`Sync successful for ${datasetSlug}`);
}

async function loadReaderInstances(dataset, branchCommitMapping) {
  datasetVersionReaderInstances[dataset.slug] = {}

  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    const branchPath = path.join(rootPath, dataset.id, branchName);
    const readerInstance = new DDFCsvReader.getDDFCsvReaderObject();
    readerInstance.init({
      path: branchPath,
      resultTransformer,
    });
    Log.info(`Created a reader instance for ${dataset.slug}/${branchName}`)
    datasetVersionReaderInstances[dataset.slug][branchName] = readerInstance
  }
}