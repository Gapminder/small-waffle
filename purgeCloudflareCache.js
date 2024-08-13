// Fetch API and URL from Node.js
import fetch from 'node-fetch';

export const purgeCloudflareCache = async (urlsToPurge) => {

  // Environment variables
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;

  if (!zoneId || !apiKey || !email) {
    throw new Error('Cloudflare environment variables not set');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      'X-Auth-Email': email,
      'X-Auth-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: urlsToPurge,
    }),
  });

  const data = await response.json();

  if (data.success) {
    console.log('Cache purged successfully:', data);
  } else {
    console.error('Failed to purge cache:', data.errors);
  }
};
