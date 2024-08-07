import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
import Log from "./logger.js"

const repoUrlTemplate = (datasetId) => `https://github.com/${datasetId}`

export async function updateFilesOnDisk(rootPath, datasetId, branchCommitMapping) {

  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    await ensurePathExistsAndRepoIsCloned(rootPath, datasetId, branchName);
    await ensureLatestCommit(rootPath, datasetId, branchName, latestCommit);
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
    owner: m.id.split("/")[0],
    dataset: m.id.split("/")[1]
  }));

  const ownerFoldersToKeep = new Set(datasetsWithOwners.map(m => m.owner));
  const datasetFoldersToKeep = datasetsWithOwners.reduce((acc, d) => { 
    if (!acc[d.owner]) acc[d.owner] = new Set();
    acc[d.owner].add(d.dataset);
    return acc;
  }, {})

  const branchFoldersToKeep = datasetsWithOwners.reduce((acc, d) => { 
    if (!acc[d.id]) acc[d.id] = new Set();
    d.branches.forEach(branch => acc[d.id].add(branch));
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

export async function ensurePathExistsAndRepoIsCloned(rootPath, datasetId, branchName) {
  Log.info(`Ensuring the directory for branch ${branchName} exists`);
  
  const branchPath = path.join(rootPath, datasetId, branchName);
  if (!fs.existsSync(branchPath) || !fs.readdirSync(branchPath).includes("datapackage.json")) {
    fs.mkdirSync(branchPath, { recursive: true });
    Log.info(`Cloning the repository for branch ${branchName}`);
    await git.clone({ fs, http, dir: branchPath, url: repoUrlTemplate(datasetId), ref: branchName, singleBranch: true, depth: 1 });
  }
}

async function ensureLatestCommit(rootPath, datasetId, branchName, latestCommit) {
  Log.info(`Checking if the branch ${branchName} is referencing the latest commit`);

  const branchPath = path.join(rootPath, datasetId, branchName);
  const currentCommit = await git.resolveRef({ fs, dir: branchPath, ref: 'HEAD' }).catch(() => null);

  if (currentCommit !== latestCommit) {
    Log.info(`Fetching the latest updates for branch ${branchName}`);
    await git.fetch({ fs, http, dir: branchPath, ref: branchName });

    Log.info(`Checking out the latest commit for branch ${branchName}`);
    await git.checkout({ fs, dir: branchPath, ref: latestCommit, force: true });
  } else {
    Log.info("The checked out files are the ones from the latest commit");
  }
}
