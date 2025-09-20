import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';  // let exports map pick node/index.js
import Log from "./logger.js";
import {getGithubAuthHandler} from "./githubAppConnection.js";

const repoUrlTemplate = (githubRepoId) => `https://github.com/${githubRepoId}`;
const progressTemplate = (slug, branch, p) => `[${slug}:${branch}] ${p.phase} ${p.loaded ?? ""}${p.loaded == null ? "" : "/"}${p.total ?? ""}`;

export function cleanupAllDirectories(rootPath, datasetControlList) {
  Log.info(`Cleaning up directories for all datasets`)
  if (!fs.existsSync(rootPath)) {
    Log.info(`Root path not found, creating one: ${rootPath}`);
    fs.mkdirSync(rootPath, { recursive: true });
  } 

  const datasetsWithOwners = datasetControlList.map(m => ({
    ...m, 
    owner: m.githubRepoId.split("/")[0],
    name: m.githubRepoId.split("/")[1]
  }));

  const ownerFoldersToKeep = new Set(datasetsWithOwners.map(m => m.owner));
  const datasetFoldersToKeep = datasetsWithOwners.reduce((acc, d) => { 
    if (!acc[d.owner]) acc[d.owner] = new Set();
    acc[d.owner].add(d.name);
    return acc;
  }, {})

  const branchFoldersToKeep = datasetsWithOwners.reduce((acc, d) => { 
    if (!acc[d.githubRepoId]) acc[d.githubRepoId] = new Set();
    d.branches.forEach(branch => acc[d.githubRepoId].add(branch));
    return acc;
  }, {})

  for (let ownerDir of fs.readdirSync(rootPath)) {
    if (ownerFoldersToKeep.has(ownerDir)) {
      // check datasets
      for (let datasetDir of fs.readdirSync(path.join(rootPath, ownerDir))) {
    
        if (datasetFoldersToKeep[ownerDir].has(datasetDir)) {
          // check branches
          for (let branchDir of fs.readdirSync(path.join(rootPath, ownerDir, datasetDir))) {
            if (!branchFoldersToKeep[ownerDir + "/" + datasetDir].has(branchDir)) {
              Log.info(`🗑 Removing branch ${branchDir} of dataset ${datasetDir}`)
              fs.rmSync(path.join(rootPath, ownerDir, datasetDir, branchDir), { recursive: true, force: true });
            }
          }
        } else {
          Log.info(`🗑 Removing dataset and all its branches: ${datasetDir}`);
          fs.rmSync(path.join(rootPath, ownerDir, datasetDir), { recursive: true, force: true });
        }
      }
    } else {
      Log.info(`🗑 Removing owner and all its datasets: ${ownerDir}`);
      fs.rmSync(path.join(rootPath, ownerDir), { recursive: true, force: true });
    }
  }
}

export async function ensurePathExistsAndRepoIsCloned(rootPath, dataset, branch, updateSyncStatus) {
  const {slug, waffleFetcherAppInstallationId} = dataset;

  updateSyncStatus(`[${slug}:${branch}] Ensuring path exists and dataset is present...`);
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  if (fs.existsSync(path.join(dir, 'datapackage.json'))) 
    return updateSyncStatus(`[${slug}:${branch}] Path OK, Dataset already present`);
  
  //recreate directory
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  try {
    const url = repoUrlTemplate(dataset.githubRepoId);
    await runInSidecarProcess({action: "clone", slug, dir, url, branch, updateSyncStatus, waffleFetcherAppInstallationId });
  } catch (e) {
    throw e;
  }
}

export async function ensureLatestCommit(rootPath, dataset, branch, latestCommit, updateSyncStatus) {
  const {slug, waffleFetcherAppInstallationId} = dataset;
  updateSyncStatus(`[${slug}:${branch}] Checking if the branch ${branch} is referencing the latest commit`);

  const dir = path.join(rootPath, dataset.githubRepoId, branch);

  const currentCommit = await getCurrentCommit(rootPath, dataset, branch);
  if (currentCommit !== latestCommit) {
    try {
      await runInSidecarProcess({ action: "fetch", slug, dir, branch, updateSyncStatus, waffleFetcherAppInstallationId, latestCommit }); 
    } catch (e) {
      throw e;
    }
  } else {
    updateSyncStatus(`[${slug}:${branch}] Dataset already at the latest commit`);
  }
}

export async function getCurrentCommit(rootPath, dataset, branch) {
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  return git.resolveRef({ fs, dir, ref: 'HEAD'}).catch((e) => {throw e});
}


async function runInSidecarProcess({ action, slug, dir, url, branch, updateSyncStatus, waffleFetcherAppInstallationId, latestCommit }){
  const SIDECAR_URL = "http://127.0.0.1" + ":" + (+process.env.PORT + 1);
  const headers = { 'Content-Type': 'application/json', 'X-Worker-Secret': process.env.SIDECAR_SECRET };
  const POLLINIG_INTERVAL_MS = 500;
  const POLLINIG_TIMEOUT_MS = 10 * 60 * 1000;
 
  const heartbeat = await fetch(`${SIDECAR_URL}/heartbeat`, { method: 'GET', headers })
    .catch(() => { /* best-effort; don’t block read path */ });
 
  if (heartbeat?.status === 200) {  
    updateSyncStatus(`[${slug}:${branch}] Calling sidecar process to do the heavy git operation`);
    const jobId = slug + "+" + branch;

    await fetch(`${SIDECAR_URL}/enqueue`, { method: 'POST', headers,
      body: JSON.stringify({ jobId, action, dir, url, branch, waffleFetcherAppInstallationId, latestCommit })
    }).catch((e) => { throw e });

    return new Promise((resolve, reject) => {

      let pollingCounter = 0;
      const intervalId = setInterval(async () => {
        const statusUpdate = await fetch(`${SIDECAR_URL}/status/${jobId}`, { method: 'GET', headers })
          .catch(() => { /* best-effort; don’t block read path */ });

        if(statusUpdate?.status === 200){
          const json = await statusUpdate.json();

          updateSyncStatus(progressTemplate(slug, branch, json.currentJob.progress));
          if (json.currentJob.state === "done") {
            clearInterval(intervalId);
            resolve();
          } else if (json.currentJob.state === "error"){
            clearInterval(intervalId);
            reject(json.currentJob.error);
          }
        }

        //quit trying
        pollingCounter++;
        if (pollingCounter * POLLINIG_INTERVAL_MS > POLLINIG_TIMEOUT_MS){
          clearInterval(intervalId);
          reject("Stopped trying" + JSON.stringify(statusUpdate));
        }
      }, POLLINIG_INTERVAL_MS)
    });
  } else {
    Log.error("Sidecar is not avavilable, attempting to perform git operations in the main process");

    const onAuth = getGithubAuthHandler(waffleFetcherAppInstallationId);
    const onProgress = (progress) => {
      updateSyncStatus(progressTemplate(slug, branch, progress));
    }
    if (action === "clone") {
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Cloning..."}));
      await git.clone({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth, url });
      return;
    }
    if (action === "fetch"){
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Fetching in the main thread..."}));
      await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth });
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Checking out the latest commit in the main thread..."}));
      await git.checkout({ fs, dir, ref: latestCommit, force: true });
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Done in the main thread"}));
      return;
    }

    Log.error("Unknown action and sidecar not avavilable");
  }
}