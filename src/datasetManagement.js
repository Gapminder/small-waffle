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
import { updateAccessControlList, accessControlListCache } from "./accessControl.js";
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
export const syncStatus = {ongoing: false, events: []};

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
  const defaultBranch = getDefaultBranch(datasetSlug);
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
  return defaultBranch && branchCommitMapping ? branchCommitMapping[ defaultBranch ] : false;
}

export function getDefaultBranch(datasetSlug){
  const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
  return dataset ? dataset.default_branch || dataset.branches[0] : false;
}


export function updateSyncStatus(comment, addnew) {
  if (!addnew && syncStatus.events.length > 0)
    syncStatus.events[syncStatus.events.length - 1] = {timestamp: new Date().valueOf(), comment};
  else
    syncStatus.events.push({timestamp: new Date().valueOf(), comment});
  Log.info(comment);
}

export function syncDatasetsIfNotAlreadySyncing(datasetSlug) {
  if (syncStatus.ongoing) return syncStatus;

  syncStatus.ongoing = true;
  syncStatus.events = [];
  
  const syncFunction = datasetSlug ? syncDataset : syncAllDatasets;
  syncFunction(datasetSlug).finally(() => {
    syncStatus.ongoing = false;
  });

  return syncStatus;
}

async function syncAllDatasets(){
  updateSyncStatus("👉 Received a request to sync ALL datasets \n", true);
  await updateAllowedDatasets();
  await updateAccessControlList();

  const datasetListString = allowedDatasets.length > 0 ? allowedDatasets.map(m => m.slug).join(", ") : "";
  updateSyncStatus(`Got info about ${allowedDatasets.length} datasets: ${datasetListString}`);
    
  cleanupAllDirectories(rootPath, allowedDatasets);
  for (const dataset of allowedDatasets)
    await syncDataset(dataset.slug);

  updateSyncStatus(`🟢 Sync complete for ${allowedDatasets.length} datasets: ${datasetListString} \n`);
}

async function syncDataset(datasetSlug){
  try {
    updateSyncStatus(`👉 Syncing dataset with slug ${datasetSlug} \n`);
    const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
    if (!dataset) throw(`dataset not allowed`);
    const branchCommitMapping = await getRepoBranchCommitMapping(dataset.githubRepoId, dataset.branches);
    datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;
    await updateFilesOnDisk(rootPath, dataset.githubRepoId, branchCommitMapping, updateSyncStatus);
    updateSyncStatus('Files on disk updated successfully.');
    await loadReaderInstances(dataset, branchCommitMapping);
    updateSyncStatus(`🟢 Sync successful for dataset ${datasetSlug} \n`);
    return "Success";
  } catch (err) {
    updateSyncStatus(`🔴 Error syncing dataset ${datasetSlug}: ${err} \n`);
  }
}


export async function loadAllDatasets() {
  await updateAllowedDatasets();
  await updateAccessControlList();

  console.log(allowedDatasets, accessControlListCache);
  const datasetListString = allowedDatasets.length > 0 ? allowedDatasets.map(m => m.slug).join(", ") : "";
  Log.info(`Got info about ${allowedDatasets.length} datasets: ${datasetListString}`);

  for (const dataset of allowedDatasets)
    await loadDataset(dataset.slug);

  Log.info(`
  🟢 Load complete! This is not the complete sync. Run /sync to do that.
  `);

  return `🟢 Load complete for ${allowedDatasets.length} datasets: ${datasetListString}`;
}

export async function loadDataset(datasetSlug) {
  Log.info(`
  === Loading dataset with slug ${datasetSlug} ===
  `);

  const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);
  
  if (!dataset) throw new Error(`Syncing error: Dataset not allowed: ${datasetSlug}`);

  const branchCommitMapping = await getLocalBranchCommitMapping(rootPath, dataset.githubRepoId, dataset.branches);

  Log.info(branchCommitMapping)

  datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;

  try {
    await checkFilesOnDisk(rootPath, dataset.githubRepoId, branchCommitMapping)
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
    const branchPath = path.join(rootPath, dataset.githubRepoId, branchName);
    const readerInstance = new DDFCsvReader.getDDFCsvReaderObject();
    readerInstance.init({
      path: branchPath,
      resultTransformer,
    });
    Log.info(`Created a reader instance for ${dataset.slug}/${branchName}`)
    datasetVersionReaderInstances[dataset.slug][branchName] = readerInstance
  }
}