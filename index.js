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

Log.info("Starting small-waffle on PORT " + port);

const app = new Koa();
const api = new Router(); // routes for the main API

await loadAllDatasets();
await loadEventsFromFile();
initRoutes(api);

if(process.env.SUPABASE_JWT_SECRET) app.use(jwt({
  secret: process.env.SUPABASE_JWT_SECRET, 
  algorithms: ["HS256"],
  passthrough: true
}));

app.use(cors({
  origin: ctx => ctx.get("Origin") || "*", //super permissive policy
  credentials: true,               // if you use cookies/auth headers
  allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization'],
  maxAge: 86400
}));


app.use(compress());
app.use(serve('datasets', {maxage: 14400*1000, setHeaders: (res, path, stats) => {
  res.setHeader('Cache-Control', 'public, s-maxage=31536000, max-age=14400');
}})) 
app.use(api.routes());

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


export { app, server };