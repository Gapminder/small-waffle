import { createRequire } from 'module';
import * as path from 'path';
import {
  datasetVersionReaderInstances,
  getDatasetFromSlug,
} from "./datasetManagement.js";

import redirectLogic from "./api-redirect-logic.js";
import { recordEvent, retrieveEvent } from "./event-analytics.js";
import Log from "./logger.js";

const require = createRequire(import.meta.url);
const Urlon = require('../static/vendor-urlon2.js');

export default function initLegacyRoutes(api) {

  /*
  * Get assets - v2
  */
  api.get("/v2{/:datasetSlug}{/:branch}{/:commit}/assets{/:asset}", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const asset = ctx.params.asset;
    const user = ctx.state.user;
    const permalinkToken = ctx.get('x-share-token');
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "asset", asset, datasetSlug, branch, referer, api_version: "v2"};

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
  * Get data - v2
  */  
  api.get("/v2{/:datasetSlug}{/:branch}{/:commit}", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const queryString = ctx.querystring;
    const user = ctx.state.user;
    const permalinkToken = ctx.get('x-share-token');
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "query", datasetSlug, branch, queryString, referer, api_version: "v2"};

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
          const query_from = ddfQuery.from ?? null;

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          if (ddfQuery.from === "datapoints" && !ddfQuery.join && (datasetSlug == "_dummy-private" || datasetSlug == "population" || datasetSlug == "povcalnet") ) {
            recordEvent({...eventTemplate, status: 200, comment: "Bomb query, empty response", branch, commit, query_from});
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
          recordEvent({...eventTemplate, status: 200, comment: "Resolved query", branch, commit, timing, query_from});

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
  * OLD API - DEPRECATED V1 API
  */  
  api.get("{/:datasetSlug}{/:branch}{/:commit}", async (ctx, next) => {

    const datasetSlug = ctx.params.datasetSlug;
    const branch = ctx.params.branch;
    const commit = ctx.params.commit;
    const queryString = ctx.querystring;
    const user = ctx.state.user;
    const referer = ctx.request.headers['referer']; 
    const eventTemplate = {type: "query", datasetSlug, branch, queryString, referer, api_version: "v1"};

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
          const query_from = ddfQuery.from ?? null;

          if (ddfQuery.test500error)
            throw "Deliberate 500 error";

          if (ddfQuery.from === "datapoints" && !ddfQuery.join && (datasetSlug == "_dummy-private" || datasetSlug == "population" || datasetSlug == "povcalnet") ) {
            recordEvent({...eventTemplate, status: 200, comment: "Bomb query, empty response", branch, commit, query_from});
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
          recordEvent({...eventTemplate, status: 200, comment: "Resolved query", branch, commit, timing, query_from});

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

}
