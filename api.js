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

import { recordEvent, retrieveEvents } from "./event-analytics.js";
import fs from 'fs';

import { allowedDatasets } from "./allowedDatasets.js";

const Log = console;

export function initRoutes(api) {

  api.get("/events", async (ctx, next) => {
    Log.debug("Received a request to list all events");
    ctx.status = 200; //not cached through cloudflare cache rule
    ctx.body = JSON.stringify(retrieveEvents());
  });

  api.get("/status/:dataset([-a-z_0-9]+)?", async (ctx, next) => {
    /*
     * List all (public) datasets that are currently available.
     */
    let datasetSlug = ctx.params.dataset;
    if (!datasetSlug) {
      Log.debug("Received a list all (public) datasets request");

      //TODO: add version to DDFCsvReader.version
      let DDFCsvReaderVersion = undefined; 
      try {
        DDFCsvReaderVersion = JSON.parse(fs.readFileSync('./node_modules/@vizabi/reader-ddfcsv/package.json', 'utf8')).version; 
      } catch (error) {
        DDFCsvReaderVersion = "Failed to read ./node_modules/@vizabi/reader-ddfcsv/package.json";
        throw new Error(DDFCsvReaderVersion);
      }

      ctx.status = 200; //not cached through cloudflare cache rule
      ctx.body = JSON.stringify({
        server: {
          name: "small-waffle",
          smallWaffleVersion: process.env.npm_package_version,
          DDFCSVReaderVersion: DDFCsvReaderVersion
        },
        allowedDatasets,
        availableDatasets: Object.keys(datasetBranchCommitMapping).length ? datasetBranchCommitMapping : "No datasets on the server"
      })
    } else {
      ctx.status = 200; //not cached through cloudflare cache rule
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
      Log.info("Received a request to sync ALL datasets");
      result = await syncAllDatasets();
    } else {
      Log.info("Received a request to sync dataset: " + datasetSlug);
      result = await syncDataset(datasetSlug);
    }
    ctx.status = 200; //not cached through cloudflare cache rule
    ctx.body = {status: result};
  
  });
  
  api.get("/:datasetSlug([-a-z_0-9]+)", async (ctx, next) => {
    const datasetSlug = ctx.params.datasetSlug;
    const queryString = ctx.querystring; // Get the original query string
  
    const commit = getDefaultCommit(datasetSlug);
    //Log.info("Redirecting to default branch's commit, generic case");
    if (commit === false) {
      Log.error("403 Dataset not on allow list: " + datasetSlug);
      recordEvent(`${datasetSlug}`, {type: "query", status: "403", comment: "Dataset not on allow list", queryString});
      ctx.throw(403, `Forbidden`)
    } else {
      ctx.status = 302;
      ctx.redirect(`/${datasetSlug}/${commit}?${queryString}`);
    }
  })
  
  api.get("/:datasetSlug([-a-z_0-9]+)/assets/:asset([-a-z_0-9.]+)", async (ctx, next) => {
    const datasetSlug = ctx.params.datasetSlug;
    const asset = ctx.params.asset;
  
    const commit = getDefaultCommit(datasetSlug);
    //Log.info("Redirecting to default branch's commit, asset case");
    if (commit === false) {
      Log.error("403 Dataset not on allow list: " + datasetSlug);
      recordEvent(`${datasetSlug}/assets/${asset}`, {type: "asset", status: "403", comment: "Dataset not on allow list", queryString});
      ctx.throw(403, `Forbidden`)
    } else {
      ctx.status = 302;
      ctx.redirect(`/${datasetSlug}/${commit}/assets/${asset}`);
    }
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
          Log.info("302 Serving asset from a resolved path:", assetPath);
          recordEvent(`${datasetSlug}/${branchOrCommit}/assets/${asset}`, {type: "asset", status: "302", comment: "Serving asset from a resolved path", redirect: assetPath, datasetSlug, branch, commit});
  
          ctx.status = 302;
          ctx.redirect(assetPath);
          
        } else {
          Log.error("404 Dataset not found: ", datasetSlug);
          recordEvent(`${datasetSlug}/${branchOrCommit}/assets/${asset}`, {type: "asset", status: "404", datasetSlug});
          
          ctx.status = 404;
          ctx.body = {[datasetSlug]: "Dataset not found"};
        }
  
  
      } catch (err) {
        Log.error(err);
        recordEvent(`${datasetSlug}/${branchOrCommit}/assets/${asset}`, {type: "asset", status: "500", comment: err.message, datasetSlug});
          
        ctx.throw(500, `Sorry, small-waffle server seems to have a problem, try again later`)
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

    if (!branchCommitMapping) {
      Log.error(`404 Dataset not found: ${datasetSlug}/${branchOrCommit}`);
      ctx.throw(404, "Not found");
      return;
    }
  
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
      recordEvent(`${datasetSlug}/${branchOrCommit}?${queryString}`, {type: "query", status: "400", comment: "Query error", datasetSlug, branch, commit});
      Log.error(json ? { ddfQuery: json, req: ctx.request, err } : err);
      ctx.throw(
        400,
        err instanceof SyntaxError
          ? `400 Query is malformed: ${err.message}`
          : err.message,
      );
    }
  
    try {
      const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
      if (!readerInstance) {
        recordEvent(`${datasetSlug}/${branchOrCommit}?${queryString}`, {type: "query", status: "500", comment: `No data loaded for ${datasetSlug}/${branch}`, datasetSlug, branch, commit});
        ctx.throw(
          500,
          `500 No data loaded for ${datasetSlug}/${branch}`,
        );
      }
      const eventCount = recordEvent(`${datasetSlug}/${branchOrCommit}?${queryString}`, {type: "query", status: "200", datasetSlug, branch, commit});
      if (eventCount === 1) {
        Log.info("NEW Query reached the reader", `${datasetSlug}/${branchOrCommit}?${queryString}`);
      } else {
        Log.info(`Familiar query reached the reader, count: ${eventCount}`);
      }
      const data = await readerInstance.read(ddfQuery);
      ctx.body = data;
    } catch (err) {
      recordEvent(`${datasetSlug}/${branchOrCommit}?${queryString}`, {type: "query", status: "500", comment: err.message, datasetSlug, branch, commit});
      Log.error(err, err.stack);
      ctx.throw(
        500,
        err.message,
      );
    }
  
  });



  
  return api;
}
