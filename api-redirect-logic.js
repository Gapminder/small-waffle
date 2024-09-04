import {
    datasetBranchCommitMapping,
    getAllowedDatasetEntryFromSlug,
    getDefaultCommit,
  } from "./datasetManagement.js";

import { recordEvent } from "./event-analytics.js";
import errors from "./api-errors.js";

export default async function redirectLogic({params, queryString, type, referer="", redirectPrefix = "", redirectSuffix = "", getValidationError, callback}) {
    const {datasetSlug, branchOrCommit, asset} = params; 
    const eventTemplate = {type, asset, datasetSlug, branchOrCommit, queryString, referer};
    
    const knownErrors = errors(datasetSlug, branchOrCommit);

    function error(err, cacheControl = "no-store, max-age=0"){
      const knownError = knownErrors[err];

      if (!err.stack && knownError && knownError.length === 3) {
        // known error
        const [status, shortMessage, messageExtra] = knownError;
        recordEvent({...eventTemplate, status, comment: shortMessage});
        return {status, error: `${shortMessage} ${messageExtra}`, cacheControl};

      } else if (typeof err === "string" 
        && (err.includes("Too many query structure errors") || err.includes("Too many query definition errors"))) {        
        // hardcoded known error from ddf-query-validator inside DDFCSV reader
        recordEvent({...eventTemplate, status: 400, comment: err});
        return {status: 400, error: `${err}`, cacheControl};

      } else {
        // unknown error
        recordEvent({...eventTemplate, status: 500, comment: err.message ? err.message : err, stack:err.stack});
        return {status: 500, error: err.message ? err.message : err, cacheControl};
      }
    }
  
    function redirect(target, cacheControl = "public, s-maxage=300, max-age=300") {
      return {status: 302, redirect: `${target}${queryString?"?"+queryString:""}`, cacheControl};
    }
  
    function success(data, cacheControl = "public, s-maxage=31536000, max-age=14400"){
      return {status: 200, success: data, cacheControl};
    }
    
    if(!datasetSlug) 
      return error("NO_DATASET_GIVEN");
  
    if(!getAllowedDatasetEntryFromSlug(datasetSlug)) 
      return error("DATASET_NOT_ALLOWED");
  
    const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
    if (!branchCommitMapping) 
      return error("DATASET_NOT_FOUND");

    const validationError = getValidationError && getValidationError();
    if (validationError)
      return error(validationError)
  
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