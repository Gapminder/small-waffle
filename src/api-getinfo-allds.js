import { datasetControlList } from "./datasetControl.js"
import { datasetBranchCommitMapping } from "./datasetManagement.js";
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

  return {
    datasetControlList: filteredDCL,
    datasetBranchCommitMapping: filteredBCM,
    totalDCLCount: datasetControlList.length,
    totalBCMCount: Object.keys(datasetBranchCommitMapping).length
  }
}