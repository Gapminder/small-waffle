import { datasetControlList } from "./datasetControl.js"
import { datasetBranchCommitMapping } from "./datasetManagement.js";
import { checkAccess } from "./accessControl.js";

export function getInfoAboutAllDatasets({user = {}}){

  const filteredDCL = datasetControlList.filter(dataset => !dataset.is_private || checkAccess({
      user_uuid: user?.sub,
      resource: dataset.slug,
      minimumNeededLevel: "reader"
    }))
  
  const filteredBCM = {};
  filteredDCL.forEach(dataset => filteredBCM[dataset.slug] = datasetBranchCommitMapping[dataset.slug]);

  return {
    datasetControlList: filteredDCL,
    datasetBranchCommitMapping: filteredBCM,
    totalDCLCount: datasetControlList.length,
    totalBCMCount: Object.keys(datasetBranchCommitMapping).length
  }
}