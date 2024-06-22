import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
const Log = console;

const repoUrlTemplate = (datasetId) => `https://github.com/${datasetId}`

export async function updateFilesOnDisk(rootPath, datasetId, branchCommitMapping) {

  cleanupDirectories(rootPath, datasetId, branchCommitMapping);

  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    await ensurePathExistsAndRepoIsCloned(rootPath, datasetId, branchName);
    await ensureLatestCommit(rootPath, datasetId, branchName, latestCommit);
  }
}

function cleanupDirectories(rootPath, datasetId, branchCommitMapping) {
  Log.info(`Cleaning up directories for ${datasetId}`)

  const datasetPath = path.join(rootPath, datasetId);
  if (fs.existsSync(datasetPath)) {
    for (let dir of fs.readdirSync(datasetPath)){
      if( !Object.keys(branchCommitMapping).includes(dir) ) {
        Log.info(`Removing ${dir} of ${datasetId}`);
        fs.rmSync(path.join(rootPath, datasetId, dir), { recursive: true, force: true });
      }
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

    Log.info(`Checking out the branch ${branchName}`);
    await git.checkout({ fs, dir: branchPath, ref: branchName, force: true });

    Log.info(`Resetting to the latest commit for branch ${branchName}`);
    await git.resetIndex({ fs, dir: branchPath, ref: latestCommit, hard: true });
  } else {
    Log.info("The checked out files are the ones from the latest commit")
  }
}