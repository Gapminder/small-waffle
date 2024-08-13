import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import compress from "koa-compress";
import {
  loadAllDatasets,
} from "./datasetManagement.js";
import initRoutes from "./api.js";
import Log from "./logger.js"
import dotenv from 'dotenv';
import path from 'path';
import fs from "fs";

const environment = process.env.ENV || 'prod';
const dotenvPath = path.resolve(process.cwd(), `.env.${environment}`);

if (!fs.existsSync(dotenvPath)) {
  throw new Error(`Environment file not found: ${dotenvPath}`);
}

dotenv.config({ path: dotenvPath });

Log.debug({"env": process.env});

Log.time("spinup time");

const port = process.env.PORT;

Log.info("Starting small-waffle on PORT " + port);

const app = new Koa();
const api = new Router(); // routes for the main API

await loadAllDatasets();
initRoutes(api);

app.use(compress());
app.use(serve('datasets'));
app.use(api.routes());

const server = app.listen(port);

Log.timeEnd("spinup time");

export { app, server };