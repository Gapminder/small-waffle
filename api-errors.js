export default function errors(datasetSlug, branch, commit) {
  return {
    NO_DATASET_GIVEN: [
      400,
      `Received a request with no dataset provided`, 
      `Please specify a dataset like https://small-waffle.gapminder.org/fasttrack`
    ],
    DATASET_NOT_ALLOWED: [
      403,
      `Dataset not allowed: ${datasetSlug}`,
      `Check if the dataset is correctly added into the control google spreadsheet`
    ],
    DATASET_NOT_FOUND: [
      404,
      `Dataset allowed by config but not found: ${datasetSlug}`,
      `Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`
    ],
    DEFAULT_COMMIT_NOT_RESOLVED: [
      500,
      `Server failed to resolve the default commit for dataset ${datasetSlug}`,
      `Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`
    ],
    NO_READER_INSTANCE: [
      500,
      `No reader instance found for ${datasetSlug}/${branch}/${commit}`,
      `Try to sync this dataset https://small-waffle.gapminder.org/sync/${datasetSlug}/`
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
      `Please specify an asset like https://small-waffle.gapminder.org/sg-master/assets/world-50m.json`
    ],
  }
}
