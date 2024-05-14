import Router from 'itty-router';
import Urlon from 'urlon';
import DDFCsvReader from '@vizabi/reader-ddfcsv';

const router = Router();

router.get('/health', async ({ params, query }) => {
  return new Response("OK");
});

// Add your routes
router.get('/ddf-service-directory', () => new Response(JSON.stringify({
  list: "/",
  query: "/DATASET/VERSION",
  assets: "DATASET/VERSION/assets/ASSET",
}), { headers: { 'Content-Type': 'application/json' } }));

router.get('/:dataset/:version?', async ({ params, query }) => {
  // Implement logic here similar to your Koa.js route
  return new Response("Data processed");
});

addEventListener('fetch', event => {
  event.respondWith(router.handle(event.request));
});
