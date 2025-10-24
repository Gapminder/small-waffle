import fetch from 'node-fetch';
import Log from "./logger.js"
import {readListFromFile, writeListToFile} from './backupDBTables.js'; 

export let accessControlListCache = [];
export let permalinkAccessControlListCache = [];

export async function updateAccessControlList() {
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
    if (rows?.length > 0) accessControlListCache = rows;
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
    if (rows?.length > 0) permalinkAccessControlListCache = rows;
  }
}

async function fetchAccessControlListFromSupabase() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating access control list from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/acl?scope=eq.dataset`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  }).catch(e => {throw e});

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase ACL table: ${response.statusText}`);

  const rows = await response.json();

  if (rows?.length > 0) accessControlListCache = rows;

  Log.info("Saving access control list to a backup file");
  await writeListToFile(accessControlListCache, 'accessControlList.backup.json');
  return accessControlListCache;

}


async function fetchPermalinkAccessControlListFromSupabase() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating permalink access control list from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/acl_links?scope=eq.dataset`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  }).catch(e => {throw e});

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase permalink ACL table: ${response.statusText}`);

  const rows = await response.json();

  if (rows?.length > 0) permalinkAccessControlListCache = rows;

  Log.info("Saving permalink access control list to a backup file");
  await writeListToFile(permalinkAccessControlListCache, 'permalinkAccessControlList.backup.json');
  return permalinkAccessControlListCache;

}

