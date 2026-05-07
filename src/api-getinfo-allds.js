import { datasetControlList } from "./datasetControl.js"
import { datasetBranchCommitMapping, datasetBranchCommitTimestamp, datasetBranchCommitAuthor } from "./datasetManagement.js";
import { checkServerAccess, checkDatasetAccess } from "./accessControl.js";

export function getInfoAboutAllDatasets({user = {}}){

  const filteredDCL = datasetControlList.filter(dataset => {
    const isServerOwner = checkServerAccess(user, "owner");
    const canReadServer = checkServerAccess(user, "reader");
    const canReadDS = checkDatasetAccess(user, dataset.slug, "reader");
    return isServerOwner || (dataset.is_private ? canReadServer && canReadDS : canReadServer);
  })
  
  const filteredBCM = {};
  filteredDCL.forEach(dataset => filteredBCM[dataset.slug] = datasetBranchCommitMapping[dataset.slug]);

  const filteredCommitTimestamp = {};
  filteredDCL.forEach(dataset => filteredCommitTimestamp[dataset.slug] = datasetBranchCommitTimestamp[dataset.slug]);

  const filteredCommitAuthor = {};
  filteredDCL.forEach(dataset => filteredCommitAuthor[dataset.slug] = datasetBranchCommitAuthor[dataset.slug]);

  return {
    datasetControlList: filteredDCL,
    datasetBranchCommitMapping: filteredBCM,
    commitTimeStamp: filteredCommitTimestamp,
    commitAuthor: filteredCommitAuthor,
    totalDCLCount: datasetControlList.length,
    totalBCMCount: Object.keys(datasetBranchCommitMapping).length
  }
}