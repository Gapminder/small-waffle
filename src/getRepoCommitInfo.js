import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';

export async function getCommitInfo(rootPath, dataset, branch, commitHash) {
  const dir = path.join(rootPath, dataset.githubRepoId, branch);
  const { commit } = await git.readCommit({ fs, dir, oid: commitHash });
  const unixSeconds = commit.committer.timestamp;
  return {
    commitTimeStamp: new Date(unixSeconds * 1000).toISOString(),
    commitAuthor: commit.author.name
  };
}
