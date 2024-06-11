import simpleGit from "simple-git";
import * as path from 'path';
import * as fs from 'fs';
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import {resultTransformer} from "./resultTransformer.js";
import {getRepoBranchCommitMapping} from "./getRepoBranchCommitMapping.js";
import {checkOutBranches} from "./checkOutBranches.js";
import {repoUrlTemplate} from "./repoUrlTemplate.js";

const rootPath = path.resolve("./datasets/");

const allowedDatasets = [
  {slug: "fasttrack", id: "open-numbers/ddf--gapminder--fasttrack"},
  {slug: "billy-master", id: "open-numbers/ddf--gapminder--billionaires"},
  {slug: "povcalnet-master", id: "open-numbers/ddf--worldbank--povcalnet"},
  {slug: "sg-master", id: "open-numbers/ddf--gapminder--systema_globalis"},
  {slug: "population-master", id: "open-numbers/ddf--gapminder--population"},
  {slug: "wdi-master", id: "open-numbers/ddf--open_numbers--world_development_indicators"},
  {slug: "country-flags", id: "open-numbers/ddf--gapminder--country_flag_svg"},
];

function syncAll() {

  const getDatasets = function(source){
    return fs.readdirSync(source, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.includes("ddf--"))
      .map(dirent => dirent.name)
  }

  const datasetFolders = getDatasets(rootPath);





}

const dummyReaderInstance = (new DDFCsvReader.getDDFCsvReaderObject()).init({
  path: path.join(rootPath, 'ddf--gapminder--fasttrack', 'master'),
  resultTransformer,
})

/**
 * Dataset version reader instances used to serve the data
 * Filled out during GitHub metadata / dataset refresh
 * @type {{[slug]: {[branch]: DDFCsvReader}}}
 */
export const datasetVersionReaderInstances = {
  'slug-dummy': {
    'branch-dummy': dummyReaderInstance
  },
}

export const datasetBranchCommitMapping = {
  'slug-dummy': {
    'branch-dummy': 'commit-sha-dummy'
  },
}



export async function syncDataset(datasetSlug) {

  console.info(`Syncing dataset with slug ${datasetSlug}`);

  const dataset = allowedDatasets.find(f => f.slug === datasetSlug);
  if (!dataset) {
    throw new Error(`Query error: Dataset not allowed: ${datasetSlug}`);
  }

  // check github for branch<->commit mappings
  const repoUrl = repoUrlTemplate(dataset.id)
  const branchCommitMapping = await getRepoBranchCommitMapping(dataset.id, rootPath);

  await loadDataset(branchCommitMapping)
}

export async function loadDataset(dataset, branchCommitMapping) {
  datasetBranchCommitMapping[dataset.slug] = branchCommitMapping;

  // make sure all branches are checked out locally
  try {
    await checkOutBranches(branchCommitMapping, dataset.id, rootPath)
    console.log('Branches checked out successfully.');
  } catch (err) {
    console.error('Error checking out branches:', err);
  }

  // load reader instances
  datasetVersionReaderInstances[dataset.slug] = {}
  for (const [branchName, latestCommit] of Object.entries(branchCommitMapping)) {
    const branchPath = path.join(rootPath, dataset.id, branchName);
    const readerInstance = new DDFCsvReader.getDDFCsvReaderObject();
    readerInstance.init({
      path: branchPath,
      resultTransformer,
    });
    console.info(`Created a reader instance for ${dataset.slug}/${branchName}`)
    datasetVersionReaderInstances[dataset.slug][branchName] = readerInstance
  }
}

export async function loadAllAllowedDatasets() {
  for (const dataset of allowedDatasets) {
    console.log(`=== Loading dataset ${dataset.slug} (${dataset.id}) ===`)
    const branchCommitMapping = await getRepoBranchCommitMapping(dataset.id, rootPath, false);
    await loadDataset(dataset, branchCommitMapping);
  }
  console.info("Loading complete...")
}
