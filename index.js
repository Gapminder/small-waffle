import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import jwt from "koa-jwt";
import cors from '@koa/cors';
import dotenv from 'dotenv';
import compress from "koa-compress";
import { getHeapStatistics } from 'v8';
import {
  loadAllDatasets,
} from "./src/datasetManagement.js";
import {loadEventsFromFile} from "./src/event-analytics.js";
import initRoutes from "./src/api.js";
import Log from "./src/logger.js";


Log.time("spinup time");

const dotenvResult = dotenv.config();

if (dotenvResult.error) {
  Log.error("Failed to load .env file: " + dotenvResult.error);
  process.exit(1); // Exit the process with an error code
} else {
  Log.info("Environment variables loaded successfully.");
}

const port = process.env.PORT || 3333;

Log.info(`🚀 Starting small-waffle on PORT ${port}`);

const app = new Koa();
const api = new Router(); // routes for the main API

await loadAllDatasets();
await loadEventsFromFile();
initRoutes(api);

app.use(cors({
  origin: ctx => ctx.get("Origin") || "*", //super permissive policy
  credentials: true,               // if you use cookies/auth headers
  allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization','x-share-token'],
  maxAge: 86400
}));

if(process.env.SUPABASE_JWT_SECRET) app.use(jwt({
  secret: process.env.SUPABASE_JWT_SECRET, 
  algorithms: ["HS256"],
  passthrough: true
}));

app.use(api.routes());

app.use(compress());
app.use(serve('datasets', {maxage: 14400*1000, setHeaders: (res, path, stats) => {
  res.setHeader('Cache-Control', 'public, s-maxage=31536000, max-age=14400');
}, defer: true})) 

const server = app.listen(port);

Log.timeEnd("spinup time");



async function checkMemoryUsage() {
  const { heapTotal } = process.memoryUsage();
  const { heap_size_limit } = getHeapStatistics();
  const heapTotal_PCT = Math.round(heapTotal / heap_size_limit * 100);

  Log.debug(`Current heap usage: ${heapTotal_PCT}% of limit`);

  if (heapTotal_PCT > 90) {
      Log.error('===== Reloading datasets because heap is above 90% of the limit! ======');
      await loadAllDatasets();
  }
}

setInterval(checkMemoryUsage, 60000); // Checks memory usage every minute


// Graceful shutdown
function shutdown(signal) {
  Log.info(`⛔️ Received ${signal}, shutting down…`);
  server.close((err) => {
    if (err) {
      Log.error("Error while closing server:", err);
      process.exit(1);
    }
    Log.info("✅ Server closed, port released.");
    process.exit(0);
  });
}

// Listen for PM2 / system signals
process.on("SIGINT",  () => shutdown("SIGINT"));   // Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM"));  // PM2 / systemd
process.on("SIGHUP",  () => shutdown("SIGHUP"));   // reload signals
// Nodemon uses SIGUSR2 on restart
process.on('SIGUSR2', () => shutdown("SIGUSR2"));

// Don’t die messily, log and exit via shutdown
process.on('uncaughtException', (err) => {
  Log.error('uncaughtException', err);
  shutdown("uncaughtException");
});
process.on('unhandledRejection', (reason) => {
  Log.error('unhandledRejection', reason);
  shutdown("unhandledRejection");
});

export { app, server };