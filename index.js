import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import compress from "koa-compress";
import {
  syncAllDatasets,
} from "./datasetManagement.js";
import {
  initRoutes,
} from "./api.js";

const port = process.env.PORT || 3333;
const Log = console;

if (!port){ 
  Log.error("Attempting to start small-waffle but PORT not given. Not starting anything");
} else {
  Log.info("Starting small-waffle on PORT " + port);

  const app = new Koa();
  const api = new Router(); // routes for the main API

  syncAllDatasets();
  initRoutes(api);

  app.use(compress());
  app.use(serve('datasets'));
  app.use(api.routes());
  app.listen(port);
}
