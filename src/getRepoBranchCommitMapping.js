import fetch from 'node-fetch';
import {getInstallationToken} from "./githubAppConnection.js";

const TIMEOUT_MS = 5000;

export async function requestLatestCommitHash(githubRepoId, branch, waffleFetcherAppInstallationId) {
  const privateRepoToken = await getInstallationToken(waffleFetcherAppInstallationId);
  const token = privateRepoToken || process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${githubRepoId}/commits/${branch}`;
  const headers = token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"} : {};

  const response = await fetch(url, { headers, signal: AbortSignal.timeout( TIMEOUT_MS ) })
    .catch(() => { /* swallow error */ });

  if (!response?.ok)
    throw new Error(`❌ Failed to fetch commit for ${githubRepoId} branch ${branch}: ${response.statusText}`);

  const commitData = await response.json();
  return commitData.sha;
}

