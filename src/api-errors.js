export default function errors(datasetSlug, branch, commit) {
  return {
    NO_DATASET_GIVEN: [
      400,
      `Received a request with no dataset provided`, 
      `Please specify a dataset like https://waffle-endpoint.com/v2/fasttrack`
    ],
    DATASET_NOT_CONFIGURED: [
      403,
      `Dataset not configured: ${datasetSlug}`,
      `Check if the dataset is correctly added into the control list on google spreadsheet or supabase`
    ],
    BRANCH_NOT_CONFIGURED: [
      403,
      `Branch not configured: ${datasetSlug}/${branch}`,
      `Check if the branch is correctly added into the control list on google spreadsheet or supabase`
    ],
    DATASET_NOT_FOUND: [
      404,
      `Dataset present in config but not correctly synced: ${datasetSlug}`,
      `Try to sync this dataset https://waffle-endpoint.com/sync/${datasetSlug}/`
    ],
    SYNC_UNAUTHORIZED: [
      401,
      `User doesn't have access to sync datasets or needs to login`,
      `Log in, make sure you have premission rights and those are synced with the server: https://waffle-endpoint.com/synconly/acl`
    ],
    DATASET_UNAUTHORIZED: [
      401,
      `User doesn't have access to the dataset or needs to login: ${datasetSlug}`,
      `Log in, make sure you have premission rights and those are synced with the server: https://waffle-endpoint.com/synconly/acl`
    ],
    DEFAULT_COMMIT_NOT_RESOLVED: [
      500,
      `Server failed to resolve the default commit for dataset ${datasetSlug}`,
      `Try to sync this dataset https://waffle-endpoint.com/sync/${datasetSlug}/`
    ],
    NO_READER_INSTANCE: [
      500,
      `No reader instance found for ${datasetSlug}/${branch}/${commit}`,
      `Try to sync this dataset https://waffle-endpoint.com/sync/${datasetSlug}/`
    ],
    NO_QUERY_PROVIDED: [
      400,
      `No query provided for ${datasetSlug}`,
      `The URL must have a DDFQL query part after ?`
    ],
    QUERY_PARSING_ERROR: [
      400,
      `Query failed to parse for ${datasetSlug}`,
      `The URL query must be a valid URLON v2.1.0 string. note! this is the old URLON version`
    ],
    ASSET_NOT_PROVIDED: [
      400,
      `No asset provided in the route`,
      `Please specify an asset like https://waffle-endpoint.com/sg-master/assets/world-50m.json`
    ],
  }
}
