import request from 'supertest';
import * as chai from 'chai';
import {app, server} from '../index.js';

const expect = chai.expect;

//Get latest commits
const response = await request(app.callback()).get('/status');
const status = JSON.parse(response.text);

const countryFlagsLatestFullCommit = status.availableDatasets["country-flags"].master;
const sgMasterLatestFullCommit = status.availableDatasets["sg"].master;
const popMasterLatestFullCommit = status.availableDatasets["population"].master;
const povcalnetMasterLatestFullCommit = status.availableDatasets["povcalnet"].master;

const countryFlagsLatestCommit = countryFlagsLatestFullCommit.substr(0,7);
const sgMasterLatestCommit = sgMasterLatestFullCommit.substr(0,7);
const popMasterLatestCommit = popMasterLatestFullCommit.substr(0,7);
const povcalnetMasterLatestCommit = povcalnetMasterLatestFullCommit.substr(0,7);

//Global after hook to stop server after running tests
after(done => {
    server.close(done);
});

describe('API Routes: STATUS', () => {
    it('Status has server info', async () => {
        expect(status).to.have.nested.property('server.name', 'small-waffle');
    });
    it('Status has reader info', async () => {
        expect(status).to.have.nested.property('server.DDFCSVReaderVersionInfo.package.name', "@vizabi/reader-ddfcsv");
    });
    it('Status has country-flags as one of the allowedDatasets', async () => {
        expect(status.allowedDatasets).to.deep.include({
            slug: "country-flags",
            id: "open-numbers/ddf--gapminder--country_flag_svg",
            branches: ["master"],
            default_branch: ""
        });
    });
    it('Status has country-flags as one of the availableDatasets', async () => {
        expect(status.availableDatasets).to.have.nested.property("country-flags.master", countryFlagsLatestFullCommit);
    });
});


describe('API Routes: SYNC', () => {
    it('Sync one dataset country-flags', async () => {
        const response = await request(app.callback()).get("/sync/country-flags");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('ongoing');
    });
});

describe('API Routes: INFO', () => {
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/info');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_ALLOWED', async () => {
        const response = await request(app.callback()).get('/info/webui');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not allowed");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/info/country-flags');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/country-flags/master/" + countryFlagsLatestCommit);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/info/country-flags/unknownsomething');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/country-flags/master/" + countryFlagsLatestCommit);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/info/country-flags/master');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/country-flags/master/" + countryFlagsLatestCommit);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/info/country-flags/master/unknowncommit');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/country-flags/master/" + countryFlagsLatestCommit);
    });
    it('Successful case - info', async () => {
        const response = await request(app.callback()).get('/info/country-flags/master/'+countryFlagsLatestCommit);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('name', 'ddf--gapminder--country_flag_svg');
    });
});


describe('API Routes: ASSETS', () => {
    it('ASSET_NOT_PROVIDED', async () => {
        const response = await request(app.callback()).get("/billy/assets/");
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No asset provided in the route");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/assets/world-50m.json');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_ALLOWED', async () => {
        const response = await request(app.callback()).get('/webui/assets/world-50m.json');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not allowed");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/sg/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/sg/unknown/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/sg/master/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/sg/master/unknowncommit/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirecting to target asset', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}/assets/world-50m.json`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/open-numbers/ddf--gapminder--systema_globalis/master/assets/world-50m.json");
    });
    it('Successful case - JSON asset', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--systema_globalis/master/assets/world-50m.json");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('type', 'Topology');
    });
    it('Successful case - PNG asset', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--billionaires/stage/assets/elon_musk.png");
        expect(response.status).to.equal(200);
        expect(response.headers['content-type']).to.include('image/png');
        expect(response.headers).to.have.property('content-length');
        expect(parseInt(response.headers['content-length'], 10)).to.be.above(0);
        expect(Buffer.isBuffer(response.body)).to.be.true;
    });
    it('Missing PNG asset', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--billionaires/stage/assets/missing_asset.png");
        expect(response.status).to.equal(404);
        expect(response.text).to.include('not found');
    });

});



describe('API Routes: DATA', () => {
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('QUERY_PARSING_ERROR', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_select_key@=key&=value;&value@;;&from=concepts.schema_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Query failed to parse");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get(`/?_select_key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_ALLOWED', async () => {
        const response = await request(app.callback()).get(`/webui?_select_key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not allowed");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get(`/sg?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/sg/master/${sgMasterLatestCommit}?_select_key`);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get(`/sg/unknown?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/sg/master/${sgMasterLatestCommit}?_select_key`);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get(`/sg/master?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/sg/master/${sgMasterLatestCommit}?_select_key`);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get(`/sg/master/unknowncommit?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/sg/master/${sgMasterLatestCommit}?_select_key`);
    });
    it('Successful case - entities', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('world_4region');
        expect(response.body).to.have.property('rows').that.deep.include(['africa', 1, 'Africa', 2]);
    });
    it('Successful case - datapoints', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_language=en&select_key@=geo&=time;&value@=internet/_users;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_geo_$in@=usa&=chn&=rus&=nga`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('internet_users');
        expect(response.body).to.have.property('rows').that.deep.include(["chn", 1990, 0]);
    });
    it('Successful case - datapoints', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_language=en&select_key@=geo&=gender&=time;&value@=literacy/_rate/_adult;;&from=datapoints&where_time=2011`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('literacy_rate_adult');
        expect(response.body).to.have.property('rows').that.deep.include(["arm", "0", 2011, 99.71]);
    });
    it('Successful case - datapoints large', async () => {
        const response = await request(app.callback()).get(`/population/master/${popMasterLatestFullCommit}?_select_key@=geo&=year&=age&=gender;&value@=population;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_geo_$in@=world&=chn&=rus`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.deep.include(["chn", "25", "1", 2008, 10886686]);
    });
    it('Successful case - datapoints bomb query povcalnet', async () => {
        const response = await request(app.callback()).get(`/povcalnet/master/${povcalnetMasterLatestCommit}?_language=en&select_key@=geo&=time;&value@=income/_mountain/_50bracket/_shape/_for/_log;;&from=datapoints&where_`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('income_mountain_50bracket_shape_for_log');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
    });
    it('Successful case - datapoints bomb query population', async () => {
        const response = await request(app.callback()).get(`/population/master/${popMasterLatestCommit}?_select_key@=geo&=year&=age;&value@=population;;&from=datapoints&where_`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
    });
    it('DDFCSV ddf-query-validator error - invalid "from" clause', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=blablabla`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause must be one of the list: concepts, entities, datapoints,");
    });
    it('DDFCSV ddf-query-validator error - missing "from" clause', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause couldn't be empty");
    });
    it('DDFCSV ddf-query-validator error - wrong dataset requested', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_select_key@=geo&=year&=age;&value@=population;;&from=datapoints&where_$and@_year=2022;&_geo=$geo;;;&join_$geo_key=geo&where_$or@_geo_$in@=world`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Too many query definition errors");
    });
    it('Deliberate crash to create a 500 error', async () => {
        const response = await request(app.callback()).get(`/sg/master/${sgMasterLatestCommit}?_test500error:true&select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(500);
        expect(response.text).to.include('Internal Server Error');
    });
    // this test takes very long and breaks the subsequent tests!
    // it('Deliberate crash from within the reader', async () => {
    //     //this query is achieved by taking a correct query and using double quotes around it in lunux
    //     //echo "http://localhost:4444/population-master/8606720f16f1afa47b719f951c1a3e42f83e93ad?_select_key@=geo&=year&=age;&value@=population;;&from=datapoints&where_$and@_year=2022;&_geo=$geo;;;&join_$geo_key=geo&where_$or@_geo_$in@=world"
    //     //doesn't matter on which dataset you perform it it's still doomy
    //     const response = await request(app.callback()).get(`/population-master/${popMasterLatestCommit}?_select_key@=geo&=year&=age;&value@=population;;&from=datapoints&where_@_year=2022;&_geo=;;;&join_=geo&where_@_geo_@=world`);
    //     expect(response.status).to.equal(500);
    //     expect(response.text).to.include('Internal Server Error');
    // });

});

describe('API Routes: EVENTS', () => {
    it('Events can be retreived', async () => {

        const response = await request(app.callback()).get("/events");
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body.length).to.be.greaterThan(10);
    });
    it('Events can be backed up', async () => {
        const response = await request(app.callback()).get("/backupevents/test");
        expect(response.status).to.equal(200);
        expect(response.text).to.include('events saved successfully');
    });
    
});



