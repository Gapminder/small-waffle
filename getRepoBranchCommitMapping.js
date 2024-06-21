import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
import fs from 'fs';
import path from 'path';
import {ensureRepoIsCheckedOut} from "./checkOutBranches.js";
import {repoUrlTemplate} from "./repoUrlTemplate.js";
const Log = console;

export async function getRepoBranchCommitMapping(datasetId, rootPath, remote = false) {
  const repoInfo = {};

  const repoUrl = repoUrlTemplate(datasetId);
  const masterBranchPath = path.join(rootPath, datasetId, "master");
  await ensureRepoIsCheckedOut(masterBranchPath, "master", repoUrl);
  const dir = masterBranchPath;

  try {
    Log.info('Adding the remote repository');
    await git.addRemote({fs, dir, remote: 'origin', url: repoUrl, force: true});

    if (remote) {
      Log.info('Fetching remote repository information');
      await git.fetch({fs, http, dir, remote: 'origin'});
    }

    Log.info('Listing all branches');
    const branchesInclHead = await git.listBranches({fs, dir, remote: 'origin'})
    const branches = branchesInclHead.filter(branch => branch !== "HEAD");
    Log.info('Branches:', branches);

    if (remote) {

      Log.info('Getting commits for each branch');
      for (const branch of branches) {
        const branchName = `origin/${branch}`;
        try {
          const commits = await git.log({fs, dir, ref: branchName});
          repoInfo[branch] = commits[0].oid;
          Log.info(`Most recent commit for branch ${branch}:`, commits[0]);
        } catch (error) {
          Log.error(`Error fetching commits for branch ${branch}:`, error);
        }
      }

    } else {

      for (const branch of branches) {
        const branchName = `${branch}`;
        const commitOid = await git.resolveRef({fs, dir, ref: branchName});
        repoInfo[branch] = commitOid;
      }

    }

  } catch (error) {
    Log.error('Error:', error);
  }

  return repoInfo;
}
