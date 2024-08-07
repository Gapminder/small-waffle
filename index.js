import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import compress from "koa-compress";
import {
  loadAllDatasets,
} from "./datasetManagement.js";
import initRoutes from "./api.js";
import Log from "./logger.js"

Log.time("spinup time");

const port = process.env.PORT || 3333;

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