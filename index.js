import Koa from "koa";
import Router from "koa-router";
import Urlon from "urlon";
import DDFCsvReader from "@vizabi/reader-ddfcsv";
const app = new Koa();
const port = 3333;
const api = new Router(); // routes for the main API
const Log = console;
/*
//entity request
https://big-waffle.gapminder.org/fasttrack/aaaf2d7?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true
https://66k3gz-3000.csb.app/fasttrack/aaaf2d7?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true

//example of a datapoint request
https://big-waffle.gapminder.org/fasttrack/aaaf2d7?_language=en&select_key@=geo&=time;&value@=pop&=lex&=gdp/_pcap;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_un/_state:true
https://66k3gz-3000.csb.app/fasttrack/aaaf2d7?_language=en&select_key@=geo&=time;&value@=pop&=lex&=gdp/_pcap;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_un/_state:true

//example of a concept schema request
https://big-waffle.gapminder.org/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=concepts.schema
https://66k3gz-3000.csb.app/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=concepts.schema

//example of a datapoint schema request
https://big-waffle.gapminder.org/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=datapoints.schema
https://66k3gz-3000.csb.app/fasttrack/aaaf2d7?_select_key@=key&=value;&value@;;&from=datapoints.schema

*/

const githubTemplate = (id) => `https://github.com/open-numbers/${id}.git`;

const datasetSlugToDdfId = {
  fasttrack: "ddf--gapminder--fasttrack",
  "billy-master": "ddf--gapminder--billionaires",
  "povcalnet-master": "ddf--worldbank--povcalnet",
  "sg-master": "ddf--gapminder--systema_globalis",
  "population-master": "ddf--gapminder--population",
  "wdi-master": "ddf--open_numbers--world_development_indicators.git",
  "country-flags": "ddf--gapminder--country_flag_svg",
};

api.get("/ddf-service-directory", (ctx, next) => {
  ctx.body = {
    list: "/",
    query: "/DATASET/VERSION",
    assets: "DATASET/VERSION/assets/ASSET",
  };
});

api.get("/", async (ctx, next) => {
  /*
   * List all (public) datasets that are currently available.
   */
  Log.debug("Received a list all (public) datasets request");
  ctx.body = "sdljksdfjksdfsdflsdf";
});

api.get(
  "/:dataset([-a-z_0-9]+)/:version([-a-z_0-9]+)?/assets/:asset([-a-z_0-9.]+)",
  async (ctx, next) => {
    Log.debug("Received asset query");
    throw new Error("Not implemented");
  },
);

api.get("/:dataset([-a-z_0-9]+)/:version([-a-z_0-9]+)?", async (ctx, next) => {
  Log.debug("Received DDF query");

  let json, ddfQuery;
  let version = ctx.params.version;
  let datasetSlug = ctx.params.dataset;
  Log.debug({ version, datasetSlug });

  try {
    if (!(typeof ctx.querystring === "string" && ctx.querystring.length > 10)) {
      throw new Error("Request has no query");
    }
    console.debug("ctx.querystring", ctx.querystring);
    try {
      json = Urlon.parse(decodeURIComponent(ctx.querystring)); // despite using urlon we still need to decode!
    } catch (urlonError) {
      console.error(urlonError);
      json = JSON.parse(decodeURIComponent(ctx.querystring));
    }
    ddfQuery = json;
    Log.debug({ ddfQuery });
  } catch (err) {
    // malformed queries get logged, but don't raise errors/alarms
    Log.info(json ? { ddfQuery: json, req: ctx.request, err } : err);
    ctx.throw(
      400,
      err instanceof SyntaxError
        ? `Query is malformed: ${err.message}`
        : err.message,
    );
  }

  const ddfReader = new DDFCsvReader.getDDFCsvReaderObject();
  // TOOD: Make this dynamic and respect "version" param
  ddfReader.init({
    path: datasetSlugToDdfId[datasetSlug],
    resultTransformer: (result) => {
      return result.map((record) => {
        for (const key in record) {
          if (record[key] instanceof Date)
            record[key] = "" + record[key].getUTCFullYear();
          if (typeof record[key] === "number") record[key] = "" + record[key];
        }
        return record;
      });
    },
  });

  const data = await ddfReader.read(ddfQuery, {
    //time: (d) => "" + d.getUTCFullYear(),
  });

  ctx.body = data;
});

app.use(api.routes());
app.listen(port);
