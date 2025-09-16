import fetch from 'node-fetch';
import Log from "./logger.js"

export let accessControlListCache = [];

export async function updateAccessControlList() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ENDPOINT && process.env.SUPABASE_JWT_SECRET){
      return fetchAccessControlListFromSupabase()

  }
  else {
    Log.error(".env file is not configured correctly");
  }
}

async function fetchAccessControlListFromSupabase() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = "https://" + process.env.SUPABASE_ENDPOINT;

  Log.info(`Updating access control list from Supabase DB ${endpoint}`);
  const response = await fetch(`${endpoint}/rest/v1/acl`,{
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) 
    throw new Error(`Failed to fetch supabase acl table: ${response.statusText}`);

  const rows = await response.json();

  accessControlListCache = rows;

  return Promise.resolve(accessControlListCache);

}


