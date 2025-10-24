import Urlon from "urlon";
import * as path from 'path';
import {
  datasetBranchCommitMapping,
  datasetVersionReaderInstances,
  syncStatus,
  syncDatasetsIfNotAlreadySyncing,
  getDatasetFromSlug
} from "./datasetManagement.js";

import redirectLogic from "./api-redirect-logic.js"
import { recordEvent, retrieveEvents, retrieveEvent, backupEvents, resetEvents } from "./event-analytics.js";
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import { getHeapStatistics } from 'v8';

import { datasetControlList } from "./datasetControl.js";

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
    let filename = ctx.params.filename || "manual-backup";
    ctx.status = 200; //not cached through cloudflare cache rule
    const backupStatus = await backupEvents({filename, timestamp: true});
    ctx.body = JSON.stringify(backupStatus);
  });

  /*
  * Reset events
  */
  api.get("/resetevents", async (ctx, next) => {
    Log.debug("Received a request to reset all events");
    ctx.status = 200; //not cached through cloudflare cache rule
    const resetStatus = await resetEvents();
    ctx.body = JSON.stringify(resetStatus);
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
          type: "small-waffle",
          uptime_ms: (new Date()).valueOf() - liveSince,
          liveSince,
          memory,
          smallWaffleVersion: process.env.npm_package_version,
          DDFCSVReaderVersion: DDFCsvReader.version,
          DDFCSVReaderVersionInfo: DDFCsvReader.versionInfo
        },
        datasetControlList,
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
  api.get("/sync/:datasetSlug([-a-z_0-9]+)?/:branch([-a-z_0-9]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const result = syncDatasetsIfNotAlreadySyncing(datasetSlug, branch);
    ctx.status = 200; 
    ctx.body = result;
  });

  /*
  * Check sync progress
  */
  api.get("/syncprogress", async (ctx, next) => {
    ctx.status = 200; 
    ctx.body = syncStatus;
  });

  /*
  * Get dataset info
  */
  api.get("/info/:datasetSlug([-a-z_0-9]+)?/:branch([-a-z_0-9]+)?/:commit([-a-z_0-9]+)?", async (ctx, next) => {
    
    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const referer = ctx.request.headers['referer']; 
    const user = ctx.state.user;
    const permalinkToken = ctx.get('X-Share-Token');
    
    Log.debug(`Received an info request for ${datasetSlug}/${branch}/${commit}`);

    const {status, error, redirect, success, cacheControl} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      type: "info",
      referer,
      user,
      permalinkToken,
      redirectPrefix: `/info/${datasetSlug}/`,
      callback: async ({success, error})=>{
        
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
    ctx.set('Cache-Control', cacheControl);
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;
  });

  /*
  * Get assets
  */
  api.get("/v2/:datasetSlug([-a-z_0-9]+)?/:branch([-a-z_0-9]+)?/:commit([-a-z_0-9]+)?/assets/:asset([-a-z_0-9.]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const asset = ctx.params.asset;
    const user = ctx.state.user;
    const permalinkToken = ctx.get('X-Share-Token');
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "asset", asset, datasetSlug, branch, referer};

    const {status, error, redirect, success, cacheControl} = await redirectLogic({
      params: ctx.params, 
      queryString: ctx.queryString, 
      type: "asset",
      referer,
      user,
      permalinkToken,
      redirectPrefix: `/v2/${datasetSlug}/`,
      redirectSuffix: `/assets/${asset}/`,
      getValidationError: () => {
        return !asset ? "ASSET_NOT_PROVIDED" : false;
      },
      callback: async ({redirect})=>{
        const dataset = getDatasetFromSlug(datasetSlug);

        const assetPath = path.join("/" + dataset.githubRepoId, branch, 'assets', asset);
        const cacheControl = "public, s-maxage=31536000, max-age=14400";

        recordEvent({...eventTemplate, status: 302, comment: "Serving asset from a resolved path", redirect: assetPath, branch, commit});

        return redirect(assetPath, cacheControl);
      }
    });

    ctx.status = status;
    ctx.set('Cache-Control', cacheControl);
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;
  });


  /*
  * Get data
  */  
  api.get("/v2/:datasetSlug([-a-z_0-9]+)?/:branch([-a-z_0-9]+)?/:commit([-a-z_0-9]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const queryString = ctx.querystring;
    const user = ctx.state.user;
    const permalinkToken = ctx.get('X-Share-Token');
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "query", datasetSlug, branch, queryString, referer};

    const {status, error, redirect, success, cacheControl} = await redirectLogic({
      params: ctx.params, 
      queryString: queryString, 
      type: "query",
      referer,
      user,
      permalinkToken,
      redirectPrefix: `/v2/${datasetSlug}/`,
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
        const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
        if (!readerInstance) 
          return error("NO_READER_INSTANCE");

        try {
          const ddfQuery = Urlon.parse(decodeURIComponent(queryString));

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          if (ddfQuery.from === "datapoints" && !ddfQuery.join && (datasetSlug == "_dummy-private" || datasetSlug == "population" || datasetSlug == "povcalnet") ) {
            recordEvent({...eventTemplate, status: 200, comment: "Bomb query, empty response", branch, commit});
            return success({
              header: ddfQuery.select.key.concat(ddfQuery.select.value),
              rows: [],
              version: "",
              comment: "👋 bomb query prevented, bye"
            })
          }

          const event = retrieveEvent(eventTemplate);
          if (!event) Log.info(`New query to reader --- ${datasetSlug}/${commit}?${queryString}`);
          const timeStart = new Date().valueOf();

          //ACTUAL READER WORK IS HERE
          const data = await readerInstance.read(ddfQuery);
          data.version = commit;

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
    ctx.set('Cache-Control', cacheControl);
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;  
  });





  /*
  * OLD API - DEPRECATED V1 API, TO BE DELETED IN V3
  */  
  api.get("/:datasetSlug([-a-z_0-9]+)?/:branch([-a-z_0-9]+)?/:commit([-a-z_0-9]+)?", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const queryString = ctx.querystring;
    const user = ctx.state.user;
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "query", datasetSlug, branch, queryString, referer};

    const {status, error, redirect, success, cacheControl} = await redirectLogic({
      params: ctx.params, 
      queryString: queryString, 
      type: "query",
      referer,
      user,
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
        const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
        if (!readerInstance) 
          return error("NO_READER_INSTANCE");

        try {
          const ddfQuery = Urlon.parse(decodeURIComponent(queryString));

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          if (ddfQuery.from === "datapoints" && !ddfQuery.join && (datasetSlug == "_dummy-private" || datasetSlug == "population" || datasetSlug == "povcalnet") ) {
            recordEvent({...eventTemplate, status: 200, comment: "Bomb query, empty response", branch, commit});
            return success({
              header: ddfQuery.select.key.concat(ddfQuery.select.value),
              rows: [],
              version: "",
              comment: "👋 bomb query prevented, bye"
            })
          }

          const event = retrieveEvent(eventTemplate);
          if (!event) Log.info(`New query to reader --- ${datasetSlug}/${commit}?${queryString}`);
          const timeStart = new Date().valueOf();

          //ACTUAL READER WORK IS HERE
          const data = await readerInstance.read(ddfQuery);
          data.version = commit;

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
    ctx.set('Cache-Control', cacheControl);
    if (error) ctx.throw(status, error);
    if (redirect) ctx.redirect(redirect);
    if (success) ctx.body = success;  
  });





  api.get("/:possiblyAssetFolder([-a-z_0-9]+)?/(.*)", async (ctx, next) => {
    const possiblyAssetFolder = ctx.params.possiblyAssetFolder;

    const folders = new Set(datasetControlList.map(item => item.githubRepoId.split('/')[0]));
    if (folders.has(possiblyAssetFolder)) {
      //pass on this request to koa-static
      await next()
      return
    }
    //koa-static failed to catch a route, so it came here
    ctx.status = 404;
    ctx.body = 'Route not found';
  });

  // api.get("(.*)", async (ctx, next) => {
  //   if (ctx.url.includes("#api0=true")) {
  //     ctx.status = 404;
  //     ctx.body = 'Not Found';
  //     Log.error(`API catch-all route '*' has aborted infinite loop of API version upgrades after 1 iteration, request ${ctx.url} got a 404`);
  //     return;
  //   }
  //   ctx.set('Cache-Control', "public, s-maxage=31536000, max-age=14400");
  //   ctx.status = 302;
  //   const separator = ctx.url.includes('?') ? '&' : '?';
  //   ctx.redirect(`/api1${ctx.url}#api0=true`);
  // });

  
  return api;
}
