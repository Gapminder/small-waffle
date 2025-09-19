import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';  // let exports map pick node/index.js
import Log from "./logger.js";
import {getGithubAuthHandler} from "./githubAppConnection.js";

const repoUrlTemplate = (githubRepoId) => `https://github.com/${githubRepoId}`

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

export async function ensurePathExistsAndRepoIsCloned(rootPath, githubRepoId, branch, updateSyncStatus, slug) {
  updateSyncStatus(`[${slug}:${branch}] Ensuring path exists and dataset is present...`);
  const dir = path.join(rootPath, githubRepoId, branch);
  if (fs.existsSync(path.join(dir, 'datapackage.json'))) return updateSyncStatus(`[${slug}:${branch}] Path OK, Dataset already present`);
  fs.mkdirSync(dir, { recursive: true });

  const url = repoUrlTemplate(githubRepoId);
  const onAuth = getGithubAuthHandler(null); //can supply installation id for multiple github app installations in different orgs
  const onProgress = (progress) => {
    updateSyncStatus(`[${slug}:${branch}] ${progress.phase} ${progress.loaded} / ${progress.total}`);
  };
  updateSyncStatus(`[${slug}:${branch}] Path created, cloning the repo...`);
  try {
    await git.clone({ fs, http, dir, url, ref: branch, singleBranch: true, depth: 1, noTags: true, onProgress, onAuth });
    updateSyncStatus(`[${slug}:${branch}] Dataset repo done cloned from Github`);  
  } catch (e) {
    throw e;
  }

}


export async function ensureLatestCommit(rootPath, githubRepoId, branch, latestCommit, updateSyncStatus, slug) {
  updateSyncStatus(`[${slug}:${branch}] Checking if the branch ${branch} is referencing the latest commit`);

  const dir = path.join(rootPath, githubRepoId, branch);
  const onAuth = getGithubAuthHandler(null); //can supply installation id for multiple github app installations in different orgs
  const onProgress = (progress) => {
    // This function is called periodically with progress updates
    updateSyncStatus(`[${slug}:${branch}] ${progress.phase} ${progress.loaded} / ${progress.total}`);
  };

  const currentCommit = await getCurrentCommit(rootPath, githubRepoId, branch);
  if (currentCommit !== latestCommit) {
    updateSyncStatus(`[${slug}:${branch}] Fetching updates from github ${githubRepoId}...`);
    try {
      await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth }); 
    } catch (e) {
      throw e;
    }

    updateSyncStatus(`[${slug}:${branch}] Checking out the latest commit...`);
    await git.checkout({ fs, dir, ref: branch, force: true });
  } else {
    updateSyncStatus(`[${slug}:${branch}] Dataset already at the latest commit`);
  }
}





export async function getCurrentCommit(rootPath, githubRepoId, branch) {
  const dir = path.join(rootPath, githubRepoId, branch);
  return git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);
}

