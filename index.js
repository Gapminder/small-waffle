import Koa from "koa";
import Router from "koa-router";
import Urlon from "urlon";
import DDFCsvReader from "@vizabi/reader-ddfcsv";
import * as path from 'path';
import * as fs from 'fs';
const app = new Koa();
const port = 3333;
const api = new Router(); // routes for the main API
const Log = console;
import duckdb from 'duckdb';
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


const rootPath = path.resolve(process.env.NODE_ARGS|| "../datasets/");

const getDatasets = function(source){
  return fs.readdirSync(source, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() && dirent.name.includes("ddf--"))
  .map(dirent => dirent.name)
}

const datasetFolders = getDatasets(rootPath);


const resultTransformer = function(result) {
  const header = Object.keys(result[0] || {});

  const rows = result.map((record) => {
    const values = [];
    for (const key of header) {
      let value = record[key];
      if (record[key] instanceof Date)
        value = +record[key].getUTCFullYear();
      if (typeof record[key] === "boolean") 
        value = +record[key];
      // numbers and strings are all good!

      values.push(value);
    }
    return values;
  });

  return { header, rows, version: "" };
};



const githubTemplate = (id) => `https://github.com/open-numbers/${id}.git`;

let datasets = [
  {slug: "fasttrack", id: "ddf--gapminder--fasttrack"},
  {slug: "billy-master", id: "ddf--gapminder--billionaires"},
  {slug: "povcalnet-master", id: "ddf--worldbank--povcalnet"},
  {slug: "sg-master", id: "ddf--gapminder--systema_globalis"},
  {slug: "population-master", id: "ddf--gapminder--population"},
  {slug: "wdi-master", id: "ddf--open_numbers--world_development_indicators"},
  {slug: "country-flags", id: "ddf--gapminder--country_flag_svg"},
];


for (let dataset of datasets) {
  if(!datasetFolders.includes(dataset.id)) {
    console.error("DATASET NOT FOUND LOCALLY: " + JSON.stringify(dataset));
    dataset = null;
    
  } else {
    dataset.readerInstance = new DDFCsvReader.getDDFCsvReaderObject();
    dataset.readerInstance.init({
      // TOOD: Make this respect "version" parm
      path: rootPath + "/" + dataset.id,
      resultTransformer,
    });

    console.info("Created a reader instance for " + dataset.slug)
  }
}

datasets = datasets.filter(f => f);


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
  ctx.body = "Welcome to small waffle! " + (datasets.length ? "Available datasets are: " + datasets.map(m => m.slug).join(", ") : "No datasets on the server");
});

api.get(
  "/:dataset([-a-z_0-9]+)/:version([-a-z_0-9]+)?/assets/:asset([-a-z_0-9.]+)",
  async (ctx, next) => {
    Log.debug("Received asset query");
    throw new Error("Not implemented");
  },
);

const db = new duckdb.Database(':memory:');
let duckdbDataLoaded = false;

import util from "util"

async function foo() {

  // Define the paths to the Parquet files
  const populationAgeGeoYearParquet = 'population-master_age$geo$year_2024052101.parquet';
  const populationGeoParquet = 'population-master_geo_2024052101.parquet';


  // Function to execute the SQL query and return the rows
  async function executeQuery() {
    const con = db.connect();

    // Promisify the con.run and con.all methods
    const runAsync = util.promisify(con.run.bind(con));
    const allAsync = util.promisify(con.all.bind(con));

    try {
      if (!duckdbDataLoaded) {
        await runAsync(`CREATE TABLE population_age_geo_year AS SELECT * FROM parquet_scan('${populationAgeGeoYearParquet}')`);
        await runAsync(`CREATE TABLE population_geo AS SELECT * FROM parquet_scan('${populationGeoParquet}')`);
        duckdbDataLoaded = true;
      }

      const query = `
      SELECT 
          "population_age_geo_year"."age", 
          "population_age_geo_year"."geo", 
          "population_age_geo_year"."year", 
          "population_age_geo_year"."population"
      FROM 
          "population_age_geo_year"
      INNER JOIN 
          "population_geo" 
      ON 
          "population_age_geo_year"."geo" = "population_geo"."geo"
      WHERE 
          "population_geo"."geo" IN ('swe');
    `;

      const rows = await allAsync(query);
      con.close();
      return rows;

    } catch (err) {
      con.close();
      throw err;
    }
  }


  // Execute the function
  return executeQuery();
}

function convertBigIntToNumber(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'bigint') {
      obj[key] = Number(obj[key]);
    }
  }
  return obj;
}

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

  if (datasetSlug === "benchduckdb") {
    const rows = await foo();
    // console.log({ rows });
    ctx.body = rows.map(convertBigIntToNumber);
    return;
  }

  const dataset = datasets.find(f => f.slug === datasetSlug);
  if (!dataset) console.error("Query error: Dataset not found:", datasetSlug);
  
  const data = await dataset.readerInstance.read(ddfQuery);

  ctx.body = data;
});

app.use(api.routes());
app.listen(port);
