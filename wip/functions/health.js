export function onRequest(context) {
  console.log(context)
  return new Response("OK " + JSON.stringify(context))
}
