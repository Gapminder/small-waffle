import Urlon from "urlon";
import * as path from 'path';
import {
  datasetBranchCommitMapping,
  datasetVersionReaderInstances,
  syncAllDatasets,
  getBranchFromCommit,
  getDatasetFromSlug,
  getDefaultCommit,
  syncDataset
} from "./datasetManagement.js";

import { allowedDatasets } from "./allowedDatasets.js";

const Log = console;

export function initRoutes(api) {

  api.get("/status/:dataset([-a-z_0-9]+)?", async (ctx, next) => {
    /*
     * List all (public) datasets that are currently available.
     */
    let datasetSlug = ctx.params.dataset;
    if (!datasetSlug) {
      Log.debug("Received a list all (public) datasets request");
      ctx.body = JSON.stringify({
        allowedDatasets,
        availableDatasets: Object.keys(datasetBranchCommitMapping).length ? datasetBranchCommitMapping : "No datasets on the server"
      })
    } else {
      ctx.body = datasetBranchCommitMapping[datasetSlug] || {[datasetSlug]: "Dataset not found"};
    }
  });
  
  api.get("/sync/:datasetSlug([-a-z_0-9]+)?", async (ctx, next) => {
    /*
     * Sync the dataset metadata and files between disk, memory and GitHub
     */
    let datasetSlug = ctx.params.datasetSlug;
    let result = "";
    if(!datasetSlug){
      result = await syncAllDatasets();
    } else {
      result = await syncDataset(datasetSlug);
    }
    ctx.body = {status: result};
  
  });
  
  api.get("/:datasetSlug([-a-z_0-9]+)", async (ctx, next) => {
    const datasetSlug = ctx.params.datasetSlug;
    const queryString = ctx.querystring; // Get the original query string
  
    const commit = getDefaultCommit(datasetSlug);
    //Log.info("Redirecting to default branch's commit, generic case");
    ctx.status = 302;
    ctx.redirect(`/${datasetSlug}/${commit}?${queryString}`);
  })
  
  api.get("/:datasetSlug([-a-z_0-9]+)/assets/:asset([-a-z_0-9.]+)", async (ctx, next) => {
    const datasetSlug = ctx.params.datasetSlug;
    const asset = ctx.params.asset;
  
    const commit = getDefaultCommit(datasetSlug);
    Log.info("Redirecting to default branch's commit, asset case");
    ctx.status = 302;
    ctx.redirect(`/${datasetSlug}/${commit}/assets/${asset}`);
  })
  
  api.get(
    "/:datasetSlug([-a-z_0-9]+)/:branchOrCommit([-a-z_0-9]+)/assets/:asset([-a-z_0-9.]+)",
    async (ctx, next) => {
      try {
        Log.debug("Received asset query");
        
        const branchOrCommit = ctx.params.branchOrCommit;
        const datasetSlug = ctx.params.datasetSlug;
        const asset = ctx.params.asset;
        
        const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
        if (branchCommitMapping) {
          const commit = branchOrCommit;
          const branch = getBranchFromCommit(datasetSlug, commit);
          const dataset = getDatasetFromSlug(datasetSlug);
  
          const assetPath = path.join("/" + dataset.id, branch, 'assets', asset);
          Log.info("Computed asset path:", assetPath);
  
          ctx.status = 302;
          ctx.redirect(assetPath);
          
        } else {
          ctx.body = {[datasetSlug]: "Dataset not found"};
        }
  
  
      } catch (err) {
        ctx.throw(500, `Sorry, the DDF Service seems to have a problem, try again later`)
      }
    },
  );
  
  
  api.get("/:datasetSlug([-a-z_0-9]+)/:branchOrCommit([-a-z_0-9]+)", async (ctx, next) => {
    //Log.info("Received DDF query");
  
    let json, ddfQuery;
    let datasetSlug = ctx.params.datasetSlug;
    let branchOrCommit = ctx.params.branchOrCommit;
  
    const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
    const queryString = ctx.querystring; // Get the original query string
  
    let branch;
    let commit;
  
    // Check if version is a commit-sha or a branch... if branch, redirect
    if (branchCommitMapping[branchOrCommit]) {
      const commit = branchCommitMapping[branchOrCommit];
      Log.info("Redirecting because branchOrCommit was a branch");
      ctx.status = 302;
      ctx.redirect(`/${datasetSlug}/${commit}?${queryString}`);
      return;
    } else {
      commit = branchOrCommit;
      branch = getBranchFromCommit(datasetSlug, commit)
    }
  
    try {
      if (!(typeof ctx.querystring === "string" && ctx.querystring.length > 10)) {
        throw new Error("Request has no query");
      }
     // Log.debug("ctx.querystring", ctx.querystring);
      try {
        json = Urlon.parse(decodeURIComponent(ctx.querystring)); // despite using urlon we still need to decode!
      } catch (urlonError) {
        //Log.error(urlonError);
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
      const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
      if (!readerInstance) {
        ctx.throw(
          500,
          `No data loaded for ${datasetSlug}/${branch}`,
        );
      }
      const data = await readerInstance.read(ddfQuery);
      ctx.body = data;
    } catch (err) {
      Log.error(err, err.stack)
      ctx.throw(
        500,
        err.message,
      );
    }
  
  });



  
  return api;
}
