// github-auth.js
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';
import Log from "./logger.js";

let cached = { token: null, expiresAt: 0, installationId: null };

export async function getInstallationToken(installationId) {
  const appId = process.env.WAFFLE_FETCHER_APP_ID;
  if (!installationId) installationId = process.env.WAFFLE_FETCHER_APP_INSTALLATION_ID;
  const githubAppPrivateKeyPath = process.env.WAFFLE_FETCHER_APP_PRIVATE_KEY_PATH;

  if (!installationId) return null; // not configured → treat as public

  const now = Date.now();
  if (cached.token && cached.installationId === installationId && now < cached.expiresAt - 5 * 60 * 1000) //5 min
    return cached.token;
  
  const privateKey = fs.readFileSync(githubAppPrivateKeyPath, "utf8");
  const auth = createAppAuth({ appId, privateKey });

  const { token, expiresAt } = await auth({ type: 'installation', installationId });
  cached = { token, expiresAt: new Date(expiresAt).getTime(), installationId };
  return token;
}

export function getGithubAuthHandler(installationId) {
  return async () => {
    Log.info(`🔒 Attempting to get a token from Github`);
    const token = await getInstallationToken(installationId);
    if (!token) return null; // no auth available
    Log.info(`🔓 Got token from Github: ${token}`);

    return { username: 'x-access-token', password: token };
  };
}
