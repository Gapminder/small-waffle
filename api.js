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
import { recordEvent, retrieveEvents, retrieveEvent, backupEvents } from "./event-analytics.js";
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import { getHeapStatistics } from 'v8';

import { allowedDatasets } from "./allowedDatasets.js";

import Log from "./logger.js"

const liveSince = (new Date()).valueOf();

export default function initRoutes(api) {

  /*
  * Fetch events
  */
  api.get("/events", async (ctx, next) => {
    Log.debug("Received a request to list all events");
    ctx.status = 200; //not cached through cloudflare cache rule
    ctx.body = JSON.stringify(retrieveEvents());
  });

  /*
  * Backup events
  */
  api.get("/backupevents/:filename([-a-z_0-9]+)?", async (ctx, next) => {
    Log.debug("Received a request to backup events");
    let filename = ctx.params.filename || "manual";
    ctx.status = 200; //not cached through cloudflare cache rule
    const backupStatus = await backupEvents({filename});
    ctx.body = JSON.stringify(backupStatus);
  });

  /*
  * Check server status, allowed and available datasets
  */
  api.get("/status/:dataset([-a-z_0-9]+)?", async (ctx, next) => {   

    let datasetSlug = ctx.params.dataset;
    if (!datasetSlug) {
      Log.debug("Received a general status request");

      const {heapTotal, heapUsed} = process.memoryUsage();
      const {heap_size_limit} = getHeapStatistics();
      const toMB = (b) => Math.round(b/1024/1024);
      const memory = {
        limit_MB: toMB(heap_size_limit),
        heapTotal_MB: toMB(heapTotal),
        heapUsed_MB: toMB(heapUsed),
        heapTotal_PCT:Math.round(heapTotal/heap_size_limit * 100),
        heapUsed_PCT: Math.round(heapUsed/heap_size_limit * 100)
      }

      ctx.status = 200; 
      ctx.body = JSON.stringify({
        server: {
          name: "small-waffle",
          uptime_ms: (new Date()).valueOf() - liveSince,
          liveSince,
          memory,
          smallWaffleVersion: process.env.npm_package_version,
          DDFCSVReaderVersion: DDFCsvReader.version,
          DDFCSVReaderVersionInfo: DDFCsvReader.versionInfo
        },
        allowedDatasets,
        availableDatasets: Object.keys(datasetBranchCommitMapping).length ? datasetBranchCommitMapping : "No datasets on the server"
      })
    } else {
      Log.debug(`Received a status requests for ${datasetSlug}`);

      const bcm = datasetBranchCommitMapping[datasetSlug];
      if (bcm){
        ctx.status = 200; 
        ctx.body = bcm;
      } else {
        ctx.throw(404, `Dataset not found: ${datasetSlug}`)
      }
    }
  });
  
  /*
  * Sync the dataset metadata and files between disk, memory and GitHub
  */
  api.get("/sync/:datasetSlug([-a-z_0-9]+)?", async (ctx, next) => {

    let datasetSlug = ctx.params.datasetSlug;
    let result = "";
    if(!datasetSlug){
      Log.info("Received a request to sync ALL datasets");
      result = await syncAllDatasets();
    } else {
      Log.info("Received a request to sync dataset: " + datasetSlug);
      result = await syncDataset(datasetSlug);
    }
    ctx.status = 200; 
    ctx.body = {status: result};
  
  });

  /*
  * Get dataset info
  */
  api.get("/info/:datasetSlug([-a-z_0-9]+)?/:branchOrCommit([-a-z_0-9]+)?", async (ctx, next) => {
    
    const datasetSlug = ctx.params.datasetSlug;
    const branchOrCommit = ctx.params.branchOrCommit;
    const referer = ctx.request.headers['referer']; 
    
    Log.debug(`Received an info request for ${datasetSlug}/${branchOrCommit}`);

    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      type: "info",
      referer,
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
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "asset", asset, datasetSlug, branchOrCommit, referer};

    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      type: "asset",
      referer,
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

        recordEvent({...eventTemplate, status: 302, comment: "Serving asset from a resolved path", redirect: assetPath, branch, commit});

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
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "query", datasetSlug, branchOrCommit, queryString, referer};

    const {status, error, redirect, success} = await redirectLogic({
      params: ctx.params, 
      queryString: queryString, 
      type: "query",
      referer,
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

        try {
          const ddfQuery = Urlon.parse(decodeURIComponent(queryString));

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          if (ddfQuery.from === "datapoints" && !ddfQuery.join && (datasetSlug == "population" || datasetSlug == "povcalnet") ) {
            recordEvent({...eventTemplate, status: 200, comment: "Bomb query, empty response", branch, commit});
            return success({
              header: ddfQuery.select.key.concat(ddfQuery.select.value),
              rows: [],
              version: "",
              comment: "👋 this is not the query you are looking for"
            })
          }

          const event = retrieveEvent(eventTemplate);
          if (!event) Log.info(`New query to reader --- ${datasetSlug}/${commit}?${queryString}`);
          const timeStart = new Date().valueOf();

          //ACTUAL READER WORK IS HERE
          const data = await readerInstance.read(ddfQuery);

          const timeEnd = new Date().valueOf();
          const timing = timeEnd - timeStart;
          recordEvent({...eventTemplate, status: 200, comment: "Resolved query", branch, commit, timing});

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



  
  return api;
}
