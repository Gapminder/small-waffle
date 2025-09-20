// git-worker/index.js
import nodeHttp from 'node:http';
import Log from "./src/logger.js"; 
import dotenv from 'dotenv';
import { getGithubAuthHandler } from './src/githubAppConnection.js';
import fs from 'fs';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';  // let exports map pick node/index.js


const dotenvResult = dotenv.config();

if (dotenvResult.error) {
  Log.error("Failed to load .env file: " + dotenvResult.error);
  process.exit(1); // Exit the process with an error code
} else {
  Log.info("Environment variables loaded successfully.");
}

const SECRET = process.env.SIDECAR_SECRET;
const PORT = process.env.SIDECAR_PORT;

const Q = new Map(); // jobId -> {state, progress, payload, tries, updatedAt}
let running = false;

function enqueue(payload) {
  const now = Date.now();
  const job = Q.get(payload.jobId);
  if (job && (job.state === 'queued' || job.state === 'running')) return job;
  Q.set(payload.jobId, { state: 'queued', progress: {}, payload, tries: 0, updatedAt: now });
  tick();
  return Q.get(payload.jobId);
}

async function tick() {
  if (running) return;
  const next = [...Q.values()].find(j => j.state === 'queued');
  if (!next) return;
  running = true;
  next.state = 'running'; 
  next.updatedAt = Date.now();

  try {
    const { dir, branch, url, action, waffleFetcherAppInstallationId, latestCommit} = next.payload;
    
    next.progress = {phase: "Authenticating..."};
    const onAuth = getGithubAuthHandler(waffleFetcherAppInstallationId); 
    const onProgress = ({phase, loaded, total} = {}) => {
      next.progress = {phase, loaded, total}
    };

    if (action === "clone"){
      await git.clone({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, prune: true, force: true, onProgress, onAuth, url });
    }
    if (action === "fetch"){
      next.progress = {phase: "Fetching..."};
      await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, noTags: true, onProgress, onAuth });
    
      next.progress = {phase: "Checking out the latest commit..."};
      await git.checkout({ fs, dir, ref: latestCommit, force: true });
      
      const result =  await git.resolveRef({ fs, dir, ref: 'HEAD'})
      console.log(result)
    }

    next.progress = {phase: "Job done"};
    next.state = 'done';
  } catch (e) {
    Log.error(e)
    next.tries = (next.tries || 0) + 1;
    next.error = String(e).slice(0, 500);
    next.state = next.tries < 3 ? 'queued' : 'error';
    // tiny backoff
    if (next.state === 'queued') setTimeout(() => tick(), 1000 * next.tries ** 2);
  } finally {
    next.updatedAt = Date.now();
    running = false;
    // schedule next
    setImmediate(tick);
  }
}

function guard(req, res) {
  if (req.headers['x-worker-secret'] !== SECRET) {
    res.writeHead(401).end('unauthorized'); return false;
  }
  return true;
}

nodeHttp.createServer(async (req, res) => {
  try {
    if (!guard(req, res)) return;
    if (req.method === 'POST' && req.url === '/enqueue') {
      const body = await new Promise(r => { let b=''; req.on('data',d=>b+=d); req.on('end',()=>r(b)); });
      const payload = JSON.parse(body);
      const job = enqueue(payload);
      res.writeHead(job.state === 'queued' ? 201 : 200, {'Content-Type':'application/json'})
         .end(JSON.stringify({ state: job.state }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/status/')) {
      const jobId = decodeURIComponent(req.url.split('/').pop());
      const currentJob = Q.get(jobId);
      const queue = [...Q.entries()].map(([k,v]) => ({jobId: k, state: v.state}));

      res.writeHead(currentJob ? 200 : 404, {'Content-Type':'application/json'})
         .end(JSON.stringify({currentJob, queue} ?? {}));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/heartbeat')) {
      res.writeHead(200).end("OK");
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/cancel/')) {
      const jobId = decodeURIComponent(req.url.split('/').pop());
      const j = Q.get(jobId);
      if (j && j.state === 'queued') { Q.delete(jobId); res.writeHead(200).end('canceled'); return; }
      res.writeHead(404).end('not found'); return;
    }
    res.writeHead(404).end('nope');
  } catch (e) {
    res.writeHead(500).end('err');
  }
}).listen(PORT, '127.0.0.1');

if (!PORT) Log.error(`Sidecar port unknown`);
Log.info(`🚀 Starting sidecar process on PORT ${PORT}`);
