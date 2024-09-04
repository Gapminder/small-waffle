import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import dotenv from 'dotenv';
import compress from "koa-compress";
import {
  loadAllDatasets,
} from "./datasetManagement.js";
import {loadEventsFromFile} from "./event-analytics.js";
import initRoutes from "./api.js";
import { getHeapStatistics } from 'v8';
import Log from "./logger.js";


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