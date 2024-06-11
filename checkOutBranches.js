import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
import {repoUrlTemplate} from "./repoUrlTemplate.js";

export async function ensureRepoIsCheckedOut(branchPath, branchName, repoUrl) {
  console.info(`Ensuring the directory for branch ${branchName} exists`);
  const files = fs.readdirSync(branchPath)
  if (!fs.existsSync(branchPath) || !files.includes("datapackage.json")) {
    fs.mkdirSync(branchPath, { recursive: true });
    console.info(`Cloning the repository for branch ${branchName}`);
    await git.clone({ fs, http, dir: branchPath, url: repoUrl, ref: branchName, singleBranch: true, depth: 1 });
  }
}


export async function checkOutBranches(branchCommitMapping, datasetId, rootPath) {
  const repoUrl = repoUrlTemplate(datasetId);
  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    const branchPath = path.join(rootPath, datasetId, branchName);
    await ensureRepoIsCheckedOut(branchPath, branchName, repoUrl);
    console.info(`Checking if the branch ${branchName} is referencing the latest commit`);
    const currentCommit = await git.resolveRef({ fs, dir: branchPath, ref: 'HEAD' }).catch(() => null);
    await ensureCommitIsLatestCommit(branchPath, branchName, currentCommit, latestCommit);
  }
}

async function ensureCommitIsLatestCommit(branchPath, branchName, currentCommit, latestCommit) {
  if (currentCommit !== latestCommit) {
    console.info(`Fetching the latest updates for branch ${branchName}`);
    await git.fetch({ fs, http, dir: branchPath, ref: branchName });

    console.info(`Checking out the branch ${branchName}`);
    await git.checkout({ fs, dir: branchPath, ref: branchName, force: true });

    console.info(`Resetting to the latest commit for branch ${branchName}`);
    await git.resetIndex({ fs, dir: branchPath, ref: latestCommit, hard: true });
  } else {
    console.info("The checked out files are the ones from the latest commit")
  }
}