import fetch from 'node-fetch';
import {getInstallationToken} from "./githubAppConnection.js";


async function fetchLatestCommit(githubRepoId, branch) {
  const privateRepoToken = await getInstallationToken();
  const token = privateRepoToken || process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${githubRepoId}/commits/${branch}`;
  const headers = token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"} : {};

  const response = await fetch(url, { headers });

  if (!response.ok)
    throw new Error(`❌ Failed to fetch commit for ${githubRepoId} branch ${branch}: ${response.statusText}`);

  const commitData = await response.json();
  return [branch, commitData.sha];
}

export async function getRepoBranchCommitMapping(githubRepoId, branches) {
  const promises = branches.map(branch => fetchLatestCommit(githubRepoId, branch));
  const array = await Promise.all(promises);
  return Object.fromEntries(array);
}
