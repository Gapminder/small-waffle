import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import compress from "koa-compress";
import {
  loadAllDatasets,
} from "./datasetManagement.js";
import initRoutes from "./api.js";

const port = process.env.PORT || 3333;
import Log from "./logger.js"
const app = new Koa();

if (!port){ 
  Log.error("Attempting to start small-waffle but PORT not given. Not starting anything");
} else {
  Log.info("Starting small-waffle on PORT " + port);

  const api = new Router(); // routes for the main API

  await loadAllDatasets();
  initRoutes(api);

  app.use(compress());
  app.use(serve('datasets'));
  app.use(api.routes());
  app.listen(port);
}


export default app;