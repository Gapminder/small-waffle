import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const apps = {
  "tools-page": { owner: "gapminder" },
  verkstad: { owner: "vizabi" },
  "small-waffle": { owner: "gapminder" },
};

export function releaseVersion(version, tag) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version) || version.length > 128) {
    throw new Error("package.json version must be a Docker-compatible release version");
  }
  if (tag && tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package.json v${version}`);
  return version;
}

// A failed authentication or registry lookup is never treated as a missing tag.
export async function releaseExists(repository, version, { user, token, request = fetch }) {
  if (!user || !token) throw new Error("GHCR_USER and GHCR_TOKEN are required to check and publish releases");
  const url = new URL("https://ghcr.io/token");
  url.searchParams.set("service", "ghcr.io");
  url.searchParams.set("scope", `repository:${repository}:pull,push`);
  const authorization = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
  const auth = await request(url, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(30000),
  });
  if (!auth.ok) throw new Error(`GHCR authentication failed (HTTP ${auth.status}); no tags changed`);
  const { token: bearer, access_token: accessToken } = await auth.json();
  if (!(bearer || accessToken)) throw new Error("GHCR did not return a registry token");
  const result = await request(`https://ghcr.io/v2/${repository}/manifests/${version}`, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${bearer || accessToken}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (result.ok) return true;
  if (result.status === 404) return false;
  throw new Error(`GHCR version lookup failed (HTTP ${result.status}); no tags changed`);
}

async function main() {
  const [app = "small-waffle", flag, ...extra] = process.argv.slice(2);
  if (!apps[app] || (flag && flag !== "--dry-run") || extra.length) {
    throw new Error("Usage: npm run publish:image -- [tools-page|verkstad|small-waffle] [--dry-run]");
  }
  if (app !== "small-waffle") throw new Error("This publisher only releases small-waffle");
  const source = root;
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
  if (git("status", "--porcelain")) throw new Error(`Commit the ${app} source changes before publishing`);
  const revision = git("rev-parse", "HEAD");
  const manifest = JSON.parse(git("show", `${revision}:package.json`));
  const version = releaseVersion(manifest.version, process.env.RELEASE_TAG);
  const owner = (process.env.GHCR_NAMESPACE || apps[app].owner).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(owner)) throw new Error("Invalid GHCR namespace");
  const repository = `${owner}/${app}`;
  const image = `ghcr.io/${repository}:${version}`;
  console.log(`${image} and :latest; source ${revision}; linux/amd64, linux/arm64`);
  if (flag === "--dry-run") return;
  const docker = (args, options = {}) => {
    const result = spawnSync("docker", args, { cwd: root, stdio: "inherit", ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Docker ${args[0]} failed; stopping release`);
  };
  const summary = text => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  };
  if (await releaseExists(repository, version, {
    user: process.env.GHCR_USER, token: process.env.GHCR_TOKEN,
  })) {
    console.log("Version already published. Neither version nor latest was changed.");
    summary(`Skipped existing \`${image}\`; neither tag changed.`);
    return;
  }
  docker(["login", "ghcr.io", "-u", process.env.GHCR_USER, "--password-stdin"], {
    input: process.env.GHCR_TOKEN, stdio: ["pipe", "inherit", "inherit"],
  });
  // Test each native runtime before pushing a multi-platform release.
  const buildArgs = [
    "--build-arg", `SOURCE_REVISION=${revision}`, "--build-arg", "SOURCE_DIRTY=false",
    "--label", `org.opencontainers.image.source=https://github.com/${repository}`,
    "--label", `org.opencontainers.image.revision=${revision}`,
    "--label", `org.opencontainers.image.version=${version}`,
    "-f", "Dockerfile"];
  for (const platform of ["linux/amd64", "linux/arm64"]) {
    const checkImage = `vizabi-release-check:${app}-${platform.split("/")[1]}`;
    docker(["buildx", "build", "--load", "--platform", platform, ...buildArgs, "-t", checkImage, "."]);
    if (app === "small-waffle") {
      docker(["run", "--rm", "--platform", platform, "--entrypoint", "node", checkImage, "-e",
        "const D=require('better-sqlite3');const db=new D(':memory:');if(db.prepare('select 1 as n').get().n!==1)process.exit(1);db.close()"]);
    } else {
      docker(["run", "--rm", "--platform", platform,
        "-e", "SUPABASE_URL=https://example.supabase.co", "-e", "SUPABASE_ANON_KEY=sb_publishable_build_check",
        "-e", "TOOLS_SITE=build-check", "-e", "VERKSTAD_URL=https://example.com/",
        checkImage, "nginx", "-t"]);
    }
  }
  // Recheck after the build, before the first registry mutation.
  if (await releaseExists(repository, version, {
    user: process.env.GHCR_USER, token: process.env.GHCR_TOKEN,
  })) {
    console.log("Version appeared during build. Neither tag was changed.");
    summary(`Skipped existing \`${image}\` after build; neither tag changed.`);
    return;
  }
  docker(["buildx", "build", "--push", "--platform", "linux/amd64,linux/arm64", ...buildArgs, "-t", image, "."]);
  const raw = execFileSync("docker", ["buildx", "imagetools", "inspect", image, "--format", "{{json .Manifest}}"], { encoding: "utf8" });
  const { digest } = JSON.parse(raw);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest || "")) throw new Error("Missing pushed image digest; latest was not updated");
  const pinned = `ghcr.io/${repository}@${digest}`;
  docker(["buildx", "imagetools", "create", "--tag", `ghcr.io/${repository}:latest`, pinned]);
  summary(`Published \`${image}\` and \`latest\`.\n\nDeploy this exact image:\n\n\`\`\`text\n${pinned}\n\`\`\``);
  console.log(`Deploy: ${pinned}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
