import {
    datasetBranchCommitMapping,
    datasetVersionReaderInstances,
    getBranchFromCommit,
    getAllowedDatasetEntryFromSlug,
    getDefaultCommit,
  } from "./datasetManagement.js";

const Log = console;

export default async function redirectLogic({params, queryString, errors, redirectPrefix, tryFunction}) {
    const {datasetSlug, branchOrCommit, asset} = params; 
  
    function error(errorcode){
      const err = errors[errorcode]
  
      if (!err.stack && err.length === 3) {
        // known error
        const [status, shortMessage, messageExtra] = err;
        Log.error(`${status} ${shortMessage}`);
        return {status, error: `${shortMessage} ${messageExtra}`};
      } else {
        // unknown error
        Log.error(err, err.stack);
        return {status: 500, error: err.message};
      }
    }
  
    function redirect(suffix) {
      const prefix = redirectPrefix;
      return {status: 302, redirect: prefix + suffix};
    }
  
    function success(data){
      return {status: 200, success: data};
    }
  
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
      !branchCommitMapping[branchOrCommit] && !Object.values(branchCommitMapping).find(f => f === branchOrCommit)
    ) {
      const defaultCommit = getDefaultCommit(datasetSlug);
      
      if (defaultCommit === false)
        return error("DEFAULT_COMMIT_NOT_RESOLVED");
  
      return redirect(defaultCommit);
    }
  
    // Redirect if branchOrCommit is a known branch
    if (branchCommitMapping[branchOrCommit]) {
      const commit = branchCommitMapping[branchOrCommit];
      return redirect(commit);
    }
  
    //datasetSlug is allowed and found among datasets
    //branchOrCommit is a known commit
    const commit = branchOrCommit;
    const branch = getBranchFromCommit(datasetSlug, commit);
  
    const readerInstance = datasetVersionReaderInstances[datasetSlug][branch];
    if (!readerInstance) 
      return error("NO_READER_INSTANCE");
  
    try {
      const data = await tryFunction(readerInstance);
      return success(data);
    } catch (err) {
      return error(err);
    }
  
  }