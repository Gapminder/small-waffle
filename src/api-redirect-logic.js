import {
    datasetBranchCommitMapping,
    getDatasetFromSlug,
    getDefaultCommit,
    getDefaultBranch
  } from "./datasetManagement.js";

import { checkServerAccess, checkDatasetAccess } from "./accessControl.js";
import { recordEvent } from "./event-analytics.js";
import errors from "./api-errors.js";

const CACHECONTROL_FOR_ERROR = "no-store, max-age=0";
const CACHECONTROL_FOR_REDIRECT = "public, s-maxage=300, max-age=300";
const CACHECONTROL_FOR_SUCCESS = "public, s-maxage=31536000, max-age=14400";

export default async function redirectLogic({params, queryString, type, referer="", user = {}, permalinkToken = "", redirectPrefix = "", redirectSuffix = "", getValidationError, callback}) {
    const {datasetSlug, branch, commit, asset} = params; 
    const eventTemplate = {type, asset, datasetSlug, branch, commit, queryString, referer};
    
    const knownErrors = errors(datasetSlug, branch, commit);

    function error(err, cacheControl = CACHECONTROL_FOR_ERROR){
      const knownError = knownErrors[err];

      if (!err.stack && knownError && knownError.length === 3) {
        // known error
        const [status, shortMessage, messageExtra] = knownError;
        recordEvent({...eventTemplate, status, comment: shortMessage});
        return {status, error: `${shortMessage} \n ${messageExtra}`, cacheControl};

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
  
    function redirect(target, cacheControl = CACHECONTROL_FOR_REDIRECT) {
      return {status: 302, redirect: `${target}${queryString?"?"+queryString:""}`, cacheControl};
    }
  
    function success(data, cacheControl = CACHECONTROL_FOR_SUCCESS){
      return {status: 200, success: data, cacheControl};
    }
    
    if(!datasetSlug) 
      return error("NO_DATASET_GIVEN");
  
    const dataset = getDatasetFromSlug(datasetSlug);
    if(!dataset) 
      return error("DATASET_NOT_CONFIGURED");
  
    const branchCommitMapping = datasetBranchCommitMapping[datasetSlug];
    if (!branchCommitMapping) 
      return error("DATASET_NOT_FOUND");

    const isServerOwner = checkServerAccess(user, "owner");
    const canReadServer = checkServerAccess(user, "reader");
    const canReadDS = checkDatasetAccess( {sub: user?.sub, permalinkToken}, datasetSlug, "reader" );
    
    if (type === "info" && !isServerOwner && !(dataset.is_private ? canReadServer && canReadDS : canReadServer) )
      return error("DATASET_UNAUTHORIZED");

    if ((type === "query" || type === "asset") && dataset.is_private && !canReadDS )
      return error("DATASET_UNAUTHORIZED");

    
    const validationError = getValidationError && getValidationError();
    if (validationError)
      return error(validationError)
  
    // Redirect if branch not given ot unknown
    // Both cases to default branch and default commit
    if (!branch || !branchCommitMapping[branch] ) {
      const defaultBranch = getDefaultBranch(datasetSlug);
      const defaultCommit = getDefaultCommit(datasetSlug);
      
      if (defaultBranch === false || defaultCommit === false)
        return error("DEFAULT_COMMIT_NOT_RESOLVED");
  
      return redirect(redirectPrefix + defaultBranch + "/" + defaultCommit.substr(0,7) + redirectSuffix);
    }

    // Redirect if commit not given ot unknown
    // Both cases to default commit
    if (!commit || !Object.values(branchCommitMapping).find(f => f === commit || f.substr(0,7) === commit) ) {
      const defaultCommit = branchCommitMapping[branch];
      
      if (defaultCommit === false)
        return error("DEFAULT_COMMIT_NOT_RESOLVED");
  
      return redirect(redirectPrefix + branch + "/" + defaultCommit.substr(0,7) + redirectSuffix);
    }
  
    //datasetSlug is allowed and found among datasets
    //branchOrCommit is a known commit
    return callback({success, redirect, error}); 
  
  }