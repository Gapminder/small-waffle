import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
import fs from 'fs';
import path from 'path';
import {ensureRepoIsCheckedOut} from "./checkOutBranches.js";
import {repoUrlTemplate} from "./repoUrlTemplate.js";

export async function getRepoBranchCommitMapping(datasetId, rootPath, remote = false) {
  const repoInfo = {};

  const repoUrl = repoUrlTemplate(datasetId);
  const masterBranchPath = path.join(rootPath, datasetId, "master");
  await ensureRepoIsCheckedOut(masterBranchPath, "master", repoUrl);
  const dir = masterBranchPath;

  try {
    console.info('Adding the remote repository');
    await git.addRemote({fs, dir, remote: 'origin', url: repoUrl, force: true});

    if (remote) {
      console.info('Fetching remote repository information');
      await git.fetch({fs, http, dir, remote: 'origin'});

      /*
      console.info('Listing all remote references');
      const remoteRefs = await git.listServerRefs({ http, url: repoUrl });
      const headRef = remoteRefs.find(ref => ref.ref === 'HEAD');

      let defaultBranch = 'master'; // Fallback to 'master'
      if (headRef && headRef.target) {
        defaultBranch = headRef.target.replace('refs/heads/', '');
      }
      console.info('Default branch:', defaultBranch);
      */
    }

    console.info('Listing all branches');
    const branchesInclHead = await git.listBranches({fs, dir, remote: 'origin'})
    const branches = branchesInclHead.filter(branch => branch !== "HEAD");
    console.info('Branches:', branches);

    if (remote) {

      console.info('Getting commits for each branch');
      for (const branch of branches) {
        const branchName = `origin/${branch}`;
        try {
          const commits = await git.log({fs, dir, ref: branchName});
          repoInfo[branch] = commits[0].oid;
          console.info(`Most recent commit for branch ${branch}:`, commits[0]);
        } catch (error) {
          console.error(`Error fetching commits for branch ${branch}:`, error);
        }
      }

      /*
      console.info('Listing all tags');
      const tags = await git.listTags({fs, dir});
      console.info('Tags:', tags);

      console.info('Getting commits for each tag');
      for (const tag of tags) {
        try {
          const commits = await git.log({fs, dir, ref: tag});
          repoInfo[tag] = commits[0].oid;
          console.info(`Most recent commits for tag ${tag}:`, commits[0]);
        } catch (error) {
          console.error(`Error fetching commits for tag ${tag}:`, error);
        }
      }
      */

    } else {

      for (const branch of branches) {
        const branchName = `${branch}`;
        const commitOid = await git.resolveRef({fs, dir, ref: branchName});
        repoInfo[branch] = commitOid;
      }

    }

  } catch (error) {
    console.error('Error:', error);
  }

  return repoInfo;
}
