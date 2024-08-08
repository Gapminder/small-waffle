import Urlon from "urlon";
import * as path from 'path';
import {
  datasetBranchCommitMapping,
  datasetVersionReaderInstances,
  syncAllDatasets,
  getBranchFromCommit,
  syncDataset,
  getAllowedDatasetEntryFromSlug
} from "./datasetManagement.js";

import redirectLogic from "./api-redirect-logic.js"
import errors from "./api-errors.js";
import { recordEvent, retrieveEvents } from "./event-analytics.js";
import DDFCsvReader from "@vizabi/reader-ddfcsv";

import { allowedDatasets } from "./allowedDatasets.js";

import Log from "./logger.js"

const liveSince = (new Date()).valueOf();

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

      const uptime_ms = (new Date()).valueOf() - liveSince;

      ctx.status = 200; //not cached through cloudflare cache rule
      ctx.body = JSON.stringify({
        server: {
          name: "small-waffle",
          uptime_ms,
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



    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      errors: errors(datasetSlug, branchOrCommit), 
      redirectPrefix: `/info/${datasetSlug}/`,
      callback: async ({success, error})=>{
        const commit = branchOrCommit;
        const branch = getBranchFromCommit(datasetSlug, commit);
      
        const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
        if (!readerInstance) 
          return error("NO_READER_INSTANCE");
      
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



    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      errors: errors(datasetSlug, branchOrCommit), 
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


  /*
  * Get data
  */  
  api.get("/:datasetSlug([-a-z_0-9]+)?/:branchOrCommit([-a-z_0-9]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branchOrCommit = ctx.params.branchOrCommit;
    const queryString = ctx.querystring;
    const eventKey = `${datasetSlug}/${branchOrCommit}?${queryString}`;


    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: queryString, 
      errors: errors(datasetSlug, branchOrCommit), 
      redirectPrefix: `/${datasetSlug}/`,
      getValidationError: () => {
        if ((typeof queryString !== "string") || queryString.length < 2) 
          return "NO_QUERY_PROVIDED";

        try {        
          Urlon.parse(decodeURIComponent(queryString));
        } catch (err) {
          return "QUERY_PARSING_ERROR";
        }

        return false;
      },

      
      callback: async ({success, error})=>{
        const commit = branchOrCommit;
        const branch = getBranchFromCommit(datasetSlug, commit);
      
        const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
        if (!readerInstance) 
          return error("NO_READER_INSTANCE");

        const event = retrieveEvents(eventKey); 
        if (!event.count)
          Log.info("NEW Query reached the reader", eventKey);
        else
          Log.info(`Familiar query reached the reader, count: ${event.count}`);
          
        try {
          const ddfQuery = Urlon.parse(decodeURIComponent(queryString));

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          const data = await readerInstance.read(ddfQuery);
          recordEvent(eventKey, {type: "query", status: "200", comment: "Query resolved", datasetSlug, branch, commit});
          return success(data);
        } catch (err) {
          recordEvent(eventKey, {type: "query", status: "500", comment: err.message, datasetSlug, branch, commit});
          return error(err);
        }

      }
    });


    ctx.status = status;
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;
    
  
    
  
  });



  
  return api;
}
