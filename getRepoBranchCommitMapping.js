import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const githubToken = process.env.GITHUB_TOKEN;

async function fetchLatestCommit(datasetId, branch, token) {
  const url = `https://api.github.com/repos/${datasetId}/commits/${branch}`;
  const headers = token ? { Authorization: `token ${token}` } : {};

  const response = await fetch(url, { headers });

  if (!response.ok)
    throw new Error(`Failed to fetch commit for branch ${branch}: ${response.statusText}`);

  const commitData = await response.json();
  return {branch, commit: commitData.sha};
}

export async function getRepoBranchCommitMapping(datasetId, branches) {
  const promises = branches.map(branch => fetchLatestCommit(datasetId, branch, githubToken));
  const result = {};
  const array = await Promise.all(promises);
  array.forEach(e => result[e.branch] = e.commit)
  return result;
}
