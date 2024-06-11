import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import Urlon from "urlon";
import {
  datasetBranchCommitMapping,
  datasetVersionReaderInstances,
  loadAllAllowedDatasets,
  syncDataset
} from "./datasetManagement.js";
const app = new Koa();
const port = 3333;
const api = new Router(); // routes for the main API
const Log = console;

loadAllAllowedDatasets()

api.get("/ddf-service-directory", (ctx, next) => {
  ctx.body = {
    list: "/",
    query: "/DATASET/VERSION",
    assets: "DATASET/VERSION/assets/ASSET",
  };
});

api.get("/status/:dataset([-a-z_0-9]+)?", async (ctx, next) => {
  /*
   * List all (public) datasets that are currently available.
   */
  let datasetSlug = ctx.params.dataset;
  if (!datasetSlug) {
    Log.debug("Received a list all (public) datasets request");
    ctx.body = "Welcome to small waffle! " + (datasets.length ? "Available datasets are: " + datasets.map(m => m.slug).join(", ") : "No datasets on the server");
  } else {
    const dataset = datasets.find(f => f.slug === datasetSlug);
    if (!dataset) ctx.body = "Dataset not found: " + datasetSlug;
    if (dataset) ctx.body = "Dataset found: " + datasetSlug;
  }
});

api.get("/sync/:dataset([-a-z_0-9]+)?", async (ctx, next) => {
  /*
   * Sync the dataset metadata and files between disk, memory and GitHub
   */
  let datasetSlug = ctx.params.dataset;
  const foo = await syncDataset(datasetSlug);
  ctx.body = {status: 'synced', "foo": foo, "bar": "zoo"}
});

api.get(
  "/:dataset([-a-z_0-9]+)/:version([-a-z_0-9]+)?/assets/:asset([-a-z_0-9.]+)",
  async (ctx, next) => {
    try {
      Log.debug("Received asset query");
      //const dataset = await Dataset.open(ctx.params.dataset, ctx.params.version, true)

      let version = ctx.params.version;
      let datasetSlug = ctx.params.dataset;

      const dataset = datasets.find(f => f.slug === datasetSlug);
      if (!dataset) console.error("Query error: Dataset not found:", datasetSlug);

      //if (!ctx.params.version) {
      //  ctx.redirect(`/${dataset.name}/${dataset.version}/assets/${ctx.params.asset}`)
      //} else {
        
        //ctx.status = 301 // Permanent redirect!
        //ctx.redirect(rootPath + "/" + dataset.id + "/assets/" + ctx.params.asset);

        const path = rootPath + "/" + dataset.id + "/assets/" + ctx.params.asset;
        app.use(serve(path));
      //}
    } catch (err) {
      if (err.code === 'DDF_DATASET_NOT_FOUND') {
        ctx.throw(404, err.message)
      } else {
        Log.error(err)
      }
      ctx.throw(500, `Sorry, the DDF Service seems to have a problem, try again later`)
    }
  },
);

api.get("/:dataset([-a-z_0-9]+)", async (ctx, next) => {
  // Log.debug("Received DDF query");
  // const datasetBranchCommitMapping
});

api.get("/:dataset([-a-z_0-9]+)/:version([-a-z_0-9]+)", async (ctx, next) => {
  //Log.debug("Received DDF query");

  let json, ddfQuery;
  let version = ctx.params.version;
  let datasetSlug = ctx.params.dataset;
  Log.debug({ version, datasetSlug });

  // TODO: check if version is a commit-sha or a branch... if branch, redirect
  const branchCommitMapping = datasetBranchCommitMapping[datasetSlug]

  if (version) {
    if (branchCommitMapping[version]) {
      const commit = branchCommitMapping.get(version);
      // TODO: Redirect because version was a branch
    }
  } else {
    const commit = branchCommitMapping["master"];
    // TOOD: Redirect to default branch's commit
  }

  try {
    if (!(typeof ctx.querystring === "string" && ctx.querystring.length > 10)) {
      throw new Error("Request has no query");
    }
   // console.debug("ctx.querystring", ctx.querystring);
    try {
      json = Urlon.parse(decodeURIComponent(ctx.querystring)); // despite using urlon we still need to decode!
    } catch (urlonError) {
      //console.error(urlonError);
      json = JSON.parse(decodeURIComponent(ctx.querystring));
    }
    ddfQuery = json;
    //Log.debug({ ddfQuery });
  } catch (err) {
    // malformed queries get logged, but don't raise errors/alarms
    Log.info(json ? { ddfQuery: json, req: ctx.request, err } : err);
    ctx.throw(
      400,
      err instanceof SyntaxError
        ? `Query is malformed: ${err.message}`
        : err.message,
    );
  }

  try {
    const readerInstance = datasetVersionReaderInstances[datasetSlug][version];
    const data = await readerInstance.read(ddfQuery);
    ctx.body = data;
  } catch (err) {
    console.error(err, err.stack)
    ctx.throw(
      500,
      err.message,
    );
  }

});

app.use(api.routes());
app.listen(port);
