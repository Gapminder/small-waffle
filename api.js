import Urlon from "urlon";
import * as path from 'path';
import {
  datasetBranchCommitMapping,
  datasetVersionReaderInstances,
  syncAllDatasets,
  getBranchFromCommit,
  getDefaultCommit,
  syncDataset,
  getAllowedDatasetEntryFromSlug
} from "./datasetManagement.js";

import redirectLogic from "./api-redirect-logic.js"
import { recordEvent, retrieveEvents } from "./event-analytics.js";
import DDFCsvReader from "@vizabi/reader-ddfcsv";

import { allowedDatasets } from "./allowedDatasets.js";

const Log = console;


export default function initRoutes(api) {

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

      ctx.status = 200; //not cached through cloudflare cache rule
      ctx.body = JSON.stringify({
        server: {
          name: "small-waffle",
          smallWaffleVersion: process.env.npm_package_version,
          DDFCSVReaderVersion: DDFCsvReader.version,
          DDFCSVReaderVersionInfo: DDFCsvReader.versionInfo
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

  /*
  * Get dataset info
  */
  api.get("/info/:datasetSlug([-a-z_0-9]+)?/:branchOrCommit([-a-z_0-9]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branchOrCommit = ctx.params.branchOrCommit;

    const errors = {
      NO_DATASET_GIVEN: [400, `Received a request to get dataset info but no dataset provided`,` Please specify a dataset, like https://small-waffle.gapminder.org/info/fasttrack/`],
      DATASET_NOT_ALLOWED: [403, `Dataset not allowed: ${datasetSlug}`,` Check if the dataset is correctly added into the control google spreadsheet`],
      DATASET_NOT_FOUND: [404, `Dataset not found: ${datasetSlug}`,` Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`],
      DEFAULT_COMMIT_NOT_RESOLVED: [500, `Server failed to resolve the default commit for dataset ${datasetSlug}`,` Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`],
      NO_READER_INSTANCE: [500, `No reader instance found for ${datasetSlug}/${branchOrCommit}`,` Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`],
    };

    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      errors, 
      redirectPrefix: `/info/${datasetSlug}/`,
      callback: async ({success, error})=>{
        const commit = branchOrCommit;
        const branch = getBranchFromCommit(datasetSlug, commit);
      
        const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
        if (!readerInstance) 
          return error(errors.NO_READER_INSTANCE);
      
        try {
          const data = await readerInstance.getDatasetInfo();
          return success(data);
        } catch (err) {
          return error(err);
        }        
      }
    });

    ctx.status = status;
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;
  });

  /*
  * Get assets
  */
  api.get("/:datasetSlug([-a-z_0-9]+)?/:branchOrCommit([-a-z_0-9]+)?/assets/:asset([-a-z_0-9.]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branchOrCommit = ctx.params.branchOrCommit;
    const asset = ctx.params.asset;

    const errors = {
      ASSET_NOT_PROVIDED: [400, `No asset provided in the route`,`Please specify an asset like https://small-waffle.gapminder.org/sg-master/assets/world-50m.json`],
      NO_DATASET_GIVEN: [400, `Received a request to get asset but no dataset provided`,` Please specify a dataset, like https://small-waffle.gapminder.org/sg-master/assets/world-50m.json`],
      DATASET_NOT_ALLOWED: [403, `Dataset not allowed: ${datasetSlug}`,` Check if the dataset is correctly added into the control google spreadsheet`],
      DATASET_NOT_FOUND: [404, `Dataset not found: ${datasetSlug}`,` Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`],
      DEFAULT_COMMIT_NOT_RESOLVED: [500, `Server failed to resolve the default commit for dataset ${datasetSlug}`,` Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`],
    };

    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      errors, 
      redirectPrefix: `/${datasetSlug}/`,
      redirectSuffix: `/assets/${asset}/`,
      getValidationError: () => {
        return !asset ? "ASSET_NOT_PROVIDED" : false;
      },
      callback: async ({redirect})=>{
        const commit = branchOrCommit;
        const branch = getBranchFromCommit(datasetSlug, commit); 
        const dataset = getAllowedDatasetEntryFromSlug(datasetSlug);

        const assetPath = path.join("/" + dataset.id, branch, 'assets', asset);
        Log.info("302 Serving asset from a resolved path:", assetPath);
        recordEvent(`${datasetSlug}/${branchOrCommit}/assets/${asset}`, {type: "asset", status: "302", comment: "Serving asset from a resolved path", redirect: assetPath, datasetSlug, branch, commit});

        return redirect(assetPath);
      }
    });

    ctx.status = status;
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;
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
  
  
  api.get("/:datasetSlug([-a-z_0-9]+)/:branchOrCommit([-a-z_0-9]+)", async (ctx, next) => {
    //Log.info("Received DDF query");
  
    let json, ddfQuery;
    let datasetSlug = ctx.params.datasetSlug;
    let branchOrCommit = ctx.params.branchOrCommit;
    
    const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
    const queryString = ctx.querystring; // Get the original query string
    const eventKey = `${datasetSlug}/${branchOrCommit}?${queryString}`;
  
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
      recordEvent(eventKey, {type: "query", status: "400", comment: "Query error", datasetSlug, branch, commit});
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
        recordEvent(eventKey, {type: "query", status: "500", comment: `No data loaded for ${datasetSlug}/${branch}`, datasetSlug, branch, commit});
        ctx.throw(
          500,
          `500 No data loaded for ${datasetSlug}/${branch}`,
        );
      }
      const event = retrieveEvents(eventKey); 
      if (!event.count)
        Log.info("NEW Query reached the reader", eventKey);
      else
        Log.info(`Familiar query reached the reader, count: ${event.count}`);

      const data = await readerInstance.read(ddfQuery);
      recordEvent(eventKey, {type: "query", status: "200", comment: "Query resolved", datasetSlug, branch, commit});
      ctx.body = data;
    } catch (err) {
      recordEvent(eventKey, {type: "query", status: "500", comment: err.message, datasetSlug, branch, commit});
      Log.error(err, err.stack);
      ctx.throw(
        500,
        err.message,
      );
    }
  
  });



  
  return api;
}
