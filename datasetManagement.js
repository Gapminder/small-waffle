import * as path from 'path';
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import {resultTransformer} from "./resultTransformer.js";
import {getRepoBranchCommitMapping} from "./getRepoBranchCommitMapping.js";
import {updateFilesOnDisk, cleanupAllDirectories} from "./updateFilesOnDisk.js";
import { updateAllowedDatasets, allowedDatasets } from "./allowedDatasets.js";
const Log = console;

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
    if (mappedCommit === commit) {
      return branch;
    }
  }
  return undefined;
}

export function getDatasetFromSlug(datasetSlug) {
  const dataset = allowedDatasets.find(f => f.slug === datasetSlug);
  if (!dataset) {
    throw new Error(`Query error: Dataset not allowed: ${datasetSlug}`);
  }
  return dataset;
}

export function getDefaultCommit(datasetSlug){
  const dataset = getDatasetFromSlug(datasetSlug);
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
  return branchCommitMapping[ dataset.branches[0] ];
}


export async function syncAllDatasets() {
  await updateAllowedDatasets();
  const datasetListString = allowedDatasets.length > 0 ? allowedDatasets.map(m => m.slug).join(", ") : "";
  Log.info(`Got info about ${allowedDatasets.length} datasets: ${datasetListString}`);

  cleanupAllDirectories(rootPath, allowedDatasets);

  for (const dataset of allowedDatasets)
    await syncDataset(dataset.slug);

  Log.info(`
  🟢 Sync complete!
  `);

  return `🟢 Sync complete for ${allowedDatasets.length} datasets: ${datasetListString}`;
}


export async function syncDataset(datasetSlug) {
  Log.info(`
  === Syncing dataset with slug ${datasetSlug} ===
  `);

  const dataset = getDatasetFromSlug(datasetSlug);

  const branchCommitMapping = await getRepoBranchCommitMapping(dataset.id, dataset.branches);

  datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;

  try {
    await updateFilesOnDisk(rootPath, dataset.id, branchCommitMapping)
    Log.info('Files on disk updated successfully.');
  } catch (err) {
    Log.error('Error updating files on disk:', err);
  }
  await loadReaderInstances(dataset, branchCommitMapping)

  Log.info(`Sync complete for dataset with slug ${datasetSlug}`);
  return(`Sync complete for dataset with slug ${datasetSlug}`);
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