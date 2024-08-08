import {
    datasetBranchCommitMapping,
    getAllowedDatasetEntryFromSlug,
    getDefaultCommit,
  } from "./datasetManagement.js";

import { recordEvent } from "./event-analytics.js";
import errors from "./api-errors.js";

import Log from "./logger.js"


export default async function redirectLogic({params, queryString, type, redirectPrefix = "", redirectSuffix = "", getValidationError, callback}) {
    const {datasetSlug, branchOrCommit, asset} = params; 
    const eventKey = asset
      ? `${datasetSlug}/${branchOrCommit}/assets/${asset}` 
      : `${datasetSlug}/${branchOrCommit}?${queryString}`;

    
    const knownErrors = errors(datasetSlug, branchOrCommit);

    function error(err, datasetSlug, branchOrCommit){
      const knownError = knownErrors[err];

      if (!err.stack && knownError && knownError.length === 3) {
        // known error
        const [status, shortMessage, messageExtra] = knownError;
        Log.error(`${status} ${shortMessage}`);
        recordEvent(eventKey, {type, status, comment: shortMessage, datasetSlug, branchOrCommit});
        return {status, error: `${shortMessage} ${messageExtra}`};

      } else if (typeof err === "string" 
        && (err.includes("Too many query structure errors") || err.includes("Too many query definition errors"))) {        
        // hardcoded known error from ddf-query-validator inside DDFCSV reader
        Log.error(`${400} ${err}`);
        recordEvent(eventKey, {type, status: 400, comment: err, datasetSlug, branchOrCommit});
        return {status: 400, error: `${err}`};

      } else {
        // unknown error
        Log.error(err, err.stack);
        recordEvent(eventKey, {type, status: 500, comment: err.message ? err.message : err, datasetSlug, branchOrCommit});
        return {status: 500, error: err.message ? err.message : err};
      }
    }
  
    function redirect(target) {
      return {status: 302, redirect: `${target}?${queryString}`};
    }
  
    function success(data){
      return {status: 200, success: data};
    }

    const validationError = getValidationError && getValidationError();
    if (validationError)
      return error(validationError)
    
    if(!datasetSlug) 
      return error("NO_DATASET_GIVEN");
  
    if(!getAllowedDatasetEntryFromSlug(datasetSlug)) 
      return error("DATASET_NOT_ALLOWED");
  
    const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
    if (!branchCommitMapping) 
      return error("DATASET_NOT_FOUND");
  
    // Redirect if branchOrCommit not given (default branch)
    // Redirect if branchOrCommit is unknown branch OR unknown commit
    if (
      !branchOrCommit
      ||
      !branchCommitMapping[branchOrCommit] && !Object.values(branchCommitMapping).find(f => f === branchOrCommit || f.substr(0,7) === branchOrCommit)
    ) {
      const defaultCommit = getDefaultCommit(datasetSlug);
      
      if (defaultCommit === false)
        return error("DEFAULT_COMMIT_NOT_RESOLVED");
  
      return redirect(redirectPrefix + defaultCommit.substr(0,7) + redirectSuffix);
    }
  
    // Redirect if branchOrCommit is a known branch
    if (branchCommitMapping[branchOrCommit]) {
      const commit = branchCommitMapping[branchOrCommit];
      return redirect(redirectPrefix + commit.substr(0,7) + redirectSuffix);
    }
  
    //datasetSlug is allowed and found among datasets
    //branchOrCommit is a known commit
    return callback({success, redirect, error}); 
  
  }