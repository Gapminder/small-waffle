import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';  // let exports map pick node/index.js
import Log from "./logger.js";
import {getGithubAuthHandler} from "./githubAppConnection.js";

const repoUrlTemplate = (githubRepoId) => `https://github.com/${githubRepoId}`

export async function updateFilesOnDisk(rootPath, githubRepoId, branchCommitMapping, updateSyncStatus) {
  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    await ensurePathExistsAndRepoIsCloned(rootPath, githubRepoId, branchName);
    await ensureLatestCommit(rootPath, githubRepoId, branchName, latestCommit, updateSyncStatus);
  }
}

export async function checkFilesOnDisk(rootPath, githubRepoId, branchCommitMapping) {
  for (const branchName of Object.keys(branchCommitMapping)) {
    await ensurePathExistsAndRepoIsCloned(rootPath, githubRepoId, branchName);
  }
}

export function cleanupAllDirectories(rootPath, allowedDatasets) {
  Log.info(`Cleaning up directories for all datasets`)
  if (!fs.existsSync(rootPath)) {
    Log.info(`Root path not found, creating one: ${rootPath}`);
    fs.mkdirSync(rootPath, { recursive: true });
  } 

  const datasetsWithOwners = allowedDatasets.map(m => ({
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

export async function ensurePathExistsAndRepoIsCloned(rootPath, githubRepoId, branchName) {
  Log.info(`Ensuring the directory for branch ${branchName} exists`);
  
  const dir = path.join(rootPath, githubRepoId, branchName);
  const url = repoUrlTemplate(githubRepoId);
  if (fs.existsSync(path.join(dir, 'datapackage.json'))) return;

  fs.mkdirSync(dir, { recursive: true });
  Log.info(`Cloning the repository into branch ${branchName}`);
  const onAuth = getGithubAuthHandler(null); //can supply installation id for multiple github app installations in different orgs
  try {
    await git.clone({ fs, http, dir, url, ref: branchName, singleBranch: true, depth: 1, onAuth });
  } catch (e) {
    // Fallback to public if auth fails or not configured
    if (String(e?.message || e).includes('authorization') || String(e?.status) === '401') {
      await git.clone({ fs, http, dir, url, ref: branchName, singleBranch: true, depth: 1 });
    } else {
      throw e;
    }
  }
}


async function ensureLatestCommit(rootPath, githubRepoId, branchName, latestCommit, updateSyncStatus) {
  updateSyncStatus(`Checking if the branch ${branchName} is referencing the latest commit`);

  const dir = path.join(rootPath, githubRepoId, branchName);
  const onAuth = getGithubAuthHandler(null); //can supply installation id for multiple github app installations in different orgs
  const onProgress = (progress) => {
    // This function is called periodically with progress updates
    updateSyncStatus(`fetch progress: ${progress.phase} ${progress.loaded} / ${progress.total}`);
  };

  const currentCommit = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);

  if (currentCommit !== latestCommit) {
    updateSyncStatus(`Fetching the latest updates for ${githubRepoId}/${branchName}`);
    try {
      await git.fetch({ fs, http, dir, ref: branchName, onProgress, onAuth }); 
    } catch (e) {
      if (String(e?.message || e).includes('authorization') || String(e?.status) === '401') {
        await git.fetch({ fs, http, dir, ref: branchName, onProgress });
      } else {
        throw e;
      }
    }

    updateSyncStatus(`Checking out the latest commit for branch ${branchName}`);
    await git.checkout({ fs, dir, ref: latestCommit, force: true });
  } else {
    updateSyncStatus("The checked out files are the ones from the latest commit");
  }
}





export async function getLocalBranchCommitMapping(rootPath, githubRepoId, branches) {
  const promises = branches.map(branch => {
    const branchPath = path.join(rootPath, githubRepoId, branch);
    return git.resolveRef({ fs, dir: branchPath, ref: 'HEAD' }).catch(() => null).then(commit => [branch, commit]);
  });
  const array = await Promise.all(promises);
  return Object.fromEntries(array);
}
