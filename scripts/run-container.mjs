import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const port = Number(process.env.PORT || 3333);
if (!Number.isInteger(port) || port < 1024 || port >= 65535) {
  throw new Error("PORT must be an integer between 1024 and 65534");
}

const secret = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  SIDECAR_PORT: String(port + 1),
  SIDECAR_SECRET: secret,
  WAFFLE_PUBLIC_ONLY: "1",
  npm_package_version: version,
};

const children = new Set();
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 8000);
  timer.unref();
}

function start(entry) {
  const child = spawn(process.execPath, [entry], { env, stdio: "inherit" });
  children.add(child);
  child.on("error", error => {
    console.error(error);
    stop(1);
  });
  child.on("close", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${entry} exited unexpectedly (${code ?? signal})`);
      stop(1);
    }
  });
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

start("git-ops-sidecar-process.index.js");

for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port + 1}/heartbeat`, {
      headers: { "X-Worker-Secret": secret },
      signal: AbortSignal.timeout(500),
    });
    if (response.ok) {
      if (!stopping) start("index.js");
      break;
    }
  } catch {
    // Wait for the Git worker to bind before the API starts loading datasets.
  }
  if (attempt === 49) {
    console.error("Git worker did not become ready");
    stop(1);
  } else {
    await delay(200);
  }
}
