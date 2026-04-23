import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';  // let exports map pick node/index.js
import Log from "./logger.js";
import { getGithubAuthHandler } from "./githubAppConnection.js";
import { validate } from "@gapminder/validate-ddf";

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

export async function ensurePathExistsAndRepoIsCloned(rootPath, dataset, branch, updateSyncStatus, skipValidation = false) {
  const {slug, waffleFetcherAppInstallationId} = dataset;

  updateSyncStatus(`[${slug}:${branch}] Ensuring path exists and dataset is present...`);
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  if (fs.existsSync(path.join(dir, 'datapackage.json'))) {
    updateSyncStatus(`[${slug}:${branch}] Path OK, Dataset already present`);
    return undefined;
  }

  //recreate directory
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const url = repoUrlTemplate(dataset.githubRepoId);
  return runInSidecarProcess({ action: "clone", slug, dir, url, branch, updateSyncStatus, waffleFetcherAppInstallationId, skipValidation });
}

export async function ensureLatestCommit(rootPath, dataset, branch, latestCommit, updateSyncStatus, skipValidation = false) {
  const {slug, waffleFetcherAppInstallationId} = dataset;
  updateSyncStatus(`[${slug}:${branch}] Checking if the branch ${branch} is referencing the latest commit`);

  const dir = path.join(rootPath, dataset.githubRepoId, branch);

  const currentCommit = await getCurrentCommit(rootPath, dataset, branch);
  if (currentCommit !== latestCommit) {
    return runInSidecarProcess({ action: "fetch", slug, dir, branch, updateSyncStatus, waffleFetcherAppInstallationId, latestCommit, skipValidation });
  } else {
    updateSyncStatus(`[${slug}:${branch}] Dataset already at the latest commit`);
    return undefined;
  }
}

export async function getCurrentCommit(rootPath, dataset, branch) {
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  return git.resolveRef({ fs, dir, ref: 'HEAD'}).catch((e) => {throw e});
}

export async function validateDatasetOnDisk(rootPath, dataset, branch, updateSyncStatus) {
  const { slug } = dataset;
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  const job = await runInSidecarProcess({ action: "validate", slug, dir, branch, updateSyncStatus });
  return job?.validationResult;
}


async function runInSidecarProcess({ action, slug, dir, url, branch, updateSyncStatus, waffleFetcherAppInstallationId, latestCommit, skipValidation = false }) {
  const SIDECAR_URL = "http://127.0.0.1" + ":" + (+process.env.PORT + 1);
  const headers = { 'Content-Type': 'application/json', 'X-Worker-Secret': process.env.SIDECAR_SECRET };
  const POLLING_INTERVAL_MS = 500;
  const POLLING_TIMEOUT_MS = 10 * 60 * 1000;

  const heartbeat = await fetch(`${SIDECAR_URL}/heartbeat`, { method: 'GET', headers })
    .catch(() => { /* swallow error and continue to the else part */ });

  if (heartbeat?.status === 200) {
    updateSyncStatus(`[${slug}:${branch}] Calling sidecar process`);
    const jobId = action === "validate" ? `${slug}+${branch}+validate` : `${slug}+${branch}`;

    await fetch(`${SIDECAR_URL}/enqueue`, { method: 'POST', headers,
      body: JSON.stringify({ jobId, action, dir, url, branch, waffleFetcherAppInstallationId, latestCommit, skipValidation })
    }).catch((e) => { throw e });

    return new Promise((resolve, reject) => {
      let pollingCounter = 0;
      const intervalId = setInterval(async () => {
        const statusUpdate = await fetch(`${SIDECAR_URL}/status/${jobId}`, { method: 'GET', headers })
          .catch(() => { /* swallow the error, keep trying */ });

        if (statusUpdate?.status === 200) {
          const json = await statusUpdate.json();
          updateSyncStatus(progressTemplate(slug, branch, json.currentJob.progress));
          if (json.currentJob.state === "done") {
            clearInterval(intervalId);
            resolve(json.currentJob);
          } else if (json.currentJob.state === "error") {
            clearInterval(intervalId);
            reject(json.currentJob.error);
          }
        }

        pollingCounter++;
        if (pollingCounter * POLLING_INTERVAL_MS > POLLING_TIMEOUT_MS) {
          clearInterval(intervalId);
          reject("Stopped trying " + JSON.stringify(statusUpdate));
        }
      }, POLLING_INTERVAL_MS);
    });
  } else {
    Log.error("Sidecar is not available, attempting to perform operations in the main process");

    if (action === "validate") {
      updateSyncStatus(`[${slug}:${branch}] Sidecar unavailable, validating in main process`);
      const validationResult = await validate(dir, {
        onlyErrors: false,
        generateDP: false,
        onProgress: (msg) => updateSyncStatus(`[${slug}:${branch}] ${msg}`),
      });
      return { validationResult };
    }

    const onAuth = getGithubAuthHandler(waffleFetcherAppInstallationId);
    const onProgress = (progress) => {
      updateSyncStatus(progressTemplate(slug, branch, progress));
    };
    if (action === "clone") {
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Cloning..."}));
      await git.clone({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth, url });
      return {};
    }
    if (action === "fetch") {
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Fetching in the main thread..."}));
      await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth });
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Checking out the latest commit in the main thread..."}));
      await git.checkout({ fs, dir, ref: latestCommit, force: true });
      updateSyncStatus(progressTemplate(slug, branch, {phase: "Done in the main thread"}));
      return {};
    }

    Log.error("Unknown action and sidecar not available");
    return {};
  }
}