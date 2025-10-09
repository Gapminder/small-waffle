import * as path from 'path';
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import {resultTransformer} from "./resultTransformer.js";
import {requestLatestCommitHash} from "./getRepoBranchCommitMapping.js";
import {
  getCurrentCommit, 
  ensurePathExistsAndRepoIsCloned,
  ensureLatestCommit, 
  cleanupAllDirectories
} from "./updateFilesOnDisk.js";
import { updateDatasetControlList, datasetControlList } from "./datasetControl.js";
import { updateAccessControlList, accessControlListCache } from "./accessControl.js";
import Log from "./logger.js"

const rootPath = path.resolve("./datasets/");

export const datasetVersionReaderInstances = {};
export const datasetBranchCommitMapping = {};
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

export function getDatasetFromSlug(datasetSlug) {
  const dataset = datasetControlList.find(f => f.slug === datasetSlug);
  return dataset || false;
}

export function getDefaultCommit(datasetSlug){
  const defaultBranch = getDefaultBranch(datasetSlug);
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
  return defaultBranch && branchCommitMapping ? branchCommitMapping[ defaultBranch ] : false;
}

export function getDefaultBranch(datasetSlug){
  const dataset = getDatasetFromSlug(datasetSlug);
  return dataset ? dataset.default_branch || dataset.branches[0] : false;
}


export function updateSyncStatus(comment, addnew) {
  if (!addnew && syncStatus.events.length > 0)
    syncStatus.events[syncStatus.events.length - 1] = {timestamp: new Date().valueOf(), comment};
  else
    syncStatus.events.push({timestamp: new Date().valueOf(), comment});
  Log.info(comment);
}

export /*SYNC!*/ function syncDatasetsIfNotAlreadySyncing(datasetSlug, branch) {
  if (syncStatus.ongoing) return syncStatus;

  syncStatus.ongoing = true;
  syncStatus.events = [];
  const done = () => {syncStatus.ongoing = false};
  
  if (datasetSlug && branch) {
    const dataset = getDatasetFromSlug(datasetSlug);
    if (!dataset) Log.error(`Dataset ${datasetSlug} not configured`);
    if (!dataset.branches.includes(branch)) Log.error(`Branch ${branch} of ${datasetSlug} not configured`);
    syncOneDataset(dataset, branch).finally(done);
  }
  else if (datasetSlug) {
    const dataset = getDatasetFromSlug(datasetSlug);
    if (!dataset) Log.error(`Dataset not configured`);
    const promises = [];
    for (const branch of dataset.branches)
      promises.push(syncOneDataset(dataset, branch));
    Promise.all(promises).finally(done);
  } else {
    syncAllDatasets().finally(done);
  }
  return syncStatus;
}

async function prepBigSyncOrLoad(){
  await updateDatasetControlList();
  const allslugs = datasetControlList.length > 0 ? datasetControlList.map(m => m.slug).join(", ") : "";
  if(datasetControlList.length)
    Log.info(`Got info about ${datasetControlList.length} datasets: ${allslugs}`);
  else
    throw new Error(`\x1b[31m 💀 🟥 SERVER CRASHED BECAUSE OF MISSING DATASET CONTROL LIST 🟥`);
  
  await updateAccessControlList();
  if(accessControlListCache.length)
    Log.info(`Got info about ${accessControlListCache.length} access rules`);
  else
    throw new Error(`\x1b[31m 💀 🟥 SERVER CRASHED BECAUSE OF MISSING ACCESS CONTROL LIST 🟥`);

  cleanupAllDirectories(rootPath, datasetControlList);
  return allslugs;
}

export async function loadAllDatasets() {
  updateSyncStatus("👉 Loading ALL datasets", true);
  const allslugs = await prepBigSyncOrLoad();

  for (const dataset of datasetControlList)
    for (const branch of dataset.branches)
      await loadOneDataset(dataset, branch);

  updateSyncStatus(`
  🟢 Load complete for ${datasetControlList.length} datasets: ${allslugs}.
  This is not the complete sync yet. Run /sync to do that.

  `);
  return "Success";
}

async function syncAllDatasets(){
  updateSyncStatus("👉 Received a request to sync ALL datasets", true);
  const allslugs = await prepBigSyncOrLoad();

  for (const dataset of datasetControlList)
    for (const branch of dataset.branches)
      await syncOneDataset(dataset, branch);

  updateSyncStatus(`
  🟢 Sync complete for ${datasetControlList.length} datasets: ${allslugs}

  `);
  return "Success";
}

async function loadOneDataset(dataset, branch) {
  updateSyncStatus(`
  📦 ${dataset.slug} ᛘ ${dataset.githubRepoId} ⼘ ${branch}`);

  try {
    await ensurePathExistsAndRepoIsCloned(rootPath, dataset, branch, updateSyncStatus);
    await loadReaderInstance(dataset, branch);
    updateSyncStatus(`[${dataset.slug}:${branch}] ✓ Load successful`);
  } catch (err) {
    updateSyncStatus(`🔴 Error loading dataset ${dataset.slug}:${branch}: ${err}`);
  }
}

async function syncOneDataset(dataset, branch){
  updateSyncStatus(`
  🔄 ${dataset.slug} ᛘ ${dataset.githubRepoId} ⼘ ${branch}`);
  
  try {  
    const remoteCommitHash = await requestLatestCommitHash(dataset.githubRepoId, branch, dataset.waffleFetcherAppInstallationId);

    await ensurePathExistsAndRepoIsCloned(rootPath, dataset, branch, updateSyncStatus);
    await ensureLatestCommit(rootPath, dataset, branch, remoteCommitHash, updateSyncStatus);
    await loadReaderInstance(dataset, branch);
    updateSyncStatus(`[${dataset.slug}:${branch}] ✓ Sync successful`);
    return "Success";
  } catch (err) {
    updateSyncStatus(`🔴 Error syncing dataset ${dataset.slug}:${branch}: ${err}`);
  }
}

async function loadReaderInstance(dataset, branch) {

  const branchPath = path.join(rootPath, dataset.githubRepoId, branch);
  const readerInstance = new DDFCsvReader.getDDFCsvReaderObject();
  readerInstance.init({path: branchPath, resultTransformer});

  (datasetVersionReaderInstances[dataset.slug] ??= {})[branch] = readerInstance; //create subobject if missing

  const currentCommit = await getCurrentCommit(rootPath, dataset, branch);
  (datasetBranchCommitMapping[dataset.slug] ??= {}) [branch] = currentCommit; //create subobject if missing

  Log.info(`[${dataset.slug}:${branch}] Created a reader instance with commit ${currentCommit.substring(0, 7)}`)
}