import fetch from 'node-fetch';
import Log from "./logger.js"
import {readListFromFile, writeListToFile} from './backupDBTables.js'; 

export let accessControlListLookup = new Map();
export let permalinkAccessControlListLookup = new Map();



export async function checkAccess({user_uuid, token_hash, resource, minimumNeededLevel = "reader"}){
  const serverId = process.env.SERVER_ID;

  if ((!user_uuid && !token_hash) || !resource) return false;
  function isLevelEnough(usersLevel, neededLevel){
    if (!usersLevel) return false; // acl record not found
    if (neededLevel === "reader") return usersLevel === "owner" || usersLevel === "editor" || usersLevel === "reader";
    if (neededLevel === "editor") return usersLevel === "owner" || usersLevel === "editor";
    if (neededLevel === "owner") return usersLevel === "owner";
  }
  return 0
    //check if server permissions are enough do do the action
    || isLevelEnough(accessControlListLookup.get([user_uuid, "server", serverId].join(".")), minimumNeededLevel)
    //if not, look for dataset permissions
    || isLevelEnough(accessControlListLookup.get([user_uuid, "dataset", resource].join(".")), minimumNeededLevel)
    //finally, look for permissions via shared link
    || isLevelEnough(permalinkAccessControlListLookup.get([token_hash, "dataset", resource].join(".")), minimumNeededLevel);
}



function arrayToLookup(array, {key, valueField = "level", defaultValue = "reader"}){
  return array.map((d) => {
      const k = key.map(field => d[field]).join(".");
      const v = d[valueField] || defaultValue;
      return [k, v];
    });
}



export async function updateAccessControl() {
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ENDPOINT && process.env.SUPABASE_JWT_SECRET){
      await fetchAccessControlListFromSupabase()
    }
    else {
      Log.error(".env file is not configured correctly");
    }
  } catch (e) {
    Log.error(e);
    Log.info("⚠️ CAN NOT FETCH ACCESS CONTROL LIST, ATTEMPTING TO RESTORE FROM BACKUP");
    const rows = await readListFromFile('accessControlList.backup.json');
    if (rows?.length > 0) accessControlListLookup = new Map(arrayToLookup(rows, {key: ["user_uuid","scope","resource"]}));
  }
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ENDPOINT && process.env.SUPABASE_JWT_SECRET){
      await fetchPermalinkAccessControlListFromSupabase()
    }
    else {
      Log.error(".env file is not configured correctly");
    }
  } catch (e) {
    Log.error(e);
    Log.info("⚠️ CAN NOT FETCH PERMALINK ACCESS CONTROL LIST, ATTEMPTING TO RESTORE FROM BACKUP");
    const rows = await readListFromFile('permalinkAccessControlList.backup.json');
    if (rows?.length > 0) permalinkAccessControlListLookup = new Map(arrayToLookup(rows, {key: ["token_hash","scope","resource"]}));
  }
  Log.info(`Number of access rules for users: ${accessControlListLookup.size}`);
  Log.info(`Number of access rules for permalinks: ${permalinkAccessControlListLookup.size}`);
  return {accessControlListLookup, permalinkAccessControlListLookup};
}



async function fetchAccessControlListFromSupabase() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating access control list from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/acl?or=(scope.eq.server,scope.eq.dataset)`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  }).catch(e => {throw e});

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase ACL table: ${response.statusText}`);

  const rows = await response.json();

  if (!rows?.length) 
    throw new Error(`Failed to fetch supabase permalink ACL table: ${rows}`);    

  Log.info("Saving access control list to a backup file");
  await writeListToFile(rows, 'accessControlList.backup.json');
  accessControlListLookup = new Map(arrayToLookup(rows, {key: ["user_uuid","scope","resource"]}));
}



async function fetchPermalinkAccessControlListFromSupabase() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating permalink access control list from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/acl_links?or=(scope.eq.server,scope.eq.dataset)`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  }).catch(e => {throw e});

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase permalink ACL table: ${response.statusText}`);

  const rows = await response.json();

  if (!rows?.length) 
    throw new Error(`Failed to fetch supabase permalink ACL table: ${rows}`);    

  Log.info("Saving permalink access control list to a backup file");
  await writeListToFile(rows, 'permalinkAccessControlList.backup.json');
  permalinkAccessControlListLookup = new Map(arrayToLookup(rows, {key: ["token_hash","scope","resource"]}));
}

