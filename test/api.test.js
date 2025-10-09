import request from 'supertest';
import * as chai from 'chai';
import {app, server} from '../index.js';

const expect = chai.expect;

//Get latest commits
const response = await request(app.callback()).get('/status');
const status = JSON.parse(response.text);

const dummyMasterLatestFullCommit = status.availableDatasets["_dummy"].master;
const dummyPrivateMainLatestFullCommit = status.availableDatasets["_dummy-private"].main;
const dummyMasterLatestCommit = dummyMasterLatestFullCommit.substr(0,7);
const dummyPrivateMainLatestCommit = dummyPrivateMainLatestFullCommit.substr(0,7);

//Global after hook to stop server after running tests
after(done => {
    server.close(done);
});

describe('API Routes: STATUS', () => {
    it('Status has server info', async () => {
        expect(status).to.have.nested.property('server.type', 'small-waffle');
    });
    it('Status has reader info', async () => {
        expect(status).to.have.nested.property('server.DDFCSVReaderVersionInfo.package.name', "@vizabi/reader-ddfcsv");
    });
    it('Status has _dummy as one of the datasetControlList', async () => {
        expect(status.datasetControlList).to.deep.include({
            slug: "_dummy",
            githubRepoId: "vizabi/ddf--gapminder--dummy_companies",
            branches: ["master", "develop"],
            default_branch: "master",
            is_private: false,
            waffleFetcherAppInstallationId: null
        });
    });
    it('Status has _dummy as one of the availableDatasets', async () => {
        expect(status.availableDatasets).to.have.nested.property("_dummy.master", dummyMasterLatestFullCommit);
    });
});


describe('API Routes: SYNC', () => {
    it('Sync one dataset _dummy', async () => {
        const response = await request(app.callback()).get("/sync/_dummy");
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
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get('/info/webui');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/info/_dummy');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/info/_dummy/unknownsomething');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master/unknowncommit');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Successful case - info', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master/'+dummyMasterLatestCommit);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('name', 'ddf--gapminder--dummy_companies');
    });
});


describe('API Routes: ASSETS', () => {
    it('ASSET_NOT_PROVIDED', async () => {
        const response = await request(app.callback()).get("/v2/_dummy/assets/");
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No asset provided in the route");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/v2/assets/waffle.png');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get('/v2/ritakukar/assets/waffle.png');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/v2/_dummy/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/v2/_dummy/unknown/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/v2/_dummy/master/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/v2/_dummy/master/unknowncommit/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirecting to target asset', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}/assets/waffle.png`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/vizabi/ddf--gapminder--dummy_companies/master/assets/waffle.png");
    });
    it('Successful case - JSON asset', async () => {
        const response = await request(app.callback()).get("/vizabi/ddf--gapminder--dummy_companies/master/assets/world-50m.json");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('type', 'Topology');
    });
    it('Successful case - PNG asset', async () => {
        const response = await request(app.callback()).get("/vizabi/ddf--gapminder--dummy_companies/master/assets/waffle.png");
        expect(response.status).to.equal(200);
        expect(response.headers['content-type']).to.include('image/png');
        expect(response.headers).to.have.property('content-length');
        expect(parseInt(response.headers['content-length'], 10)).to.be.above(0);
        expect(Buffer.isBuffer(response.body)).to.be.true;
    });
    it('Missing PNG asset', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--billionaires/stage/assets/missing_asset.png");
        expect(response.status).to.equal(404);
        expect(response.text).to.include('Not Found');
    });

});



describe('API Routes: DATA', () => {
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('QUERY_PARSING_ERROR', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?_select_key@=key&=value;&value@;;&from=concepts.schema_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Query failed to parse");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get(`/v2/?_select_key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get(`/v2/webui?_select_key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy?_select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?_select_key`);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/unknown?_select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?_select_key`);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master?_select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?_select_key`);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/unknowncommit?_select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?_select_key`);
    });
    it('Successful case - entities', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?_select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('english_speaking_company');
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 'Microsoft', 1]);
        expect(response.body).to.have.property('rows').that.deep.include(['gap', 'Gapminder', 1]);
    });
    it('Successful case - datapoints 2D', async () => {
        const query = `_language=en&select_key@=company&=year;&value@=lines/_of/_code;;&from=datapoints&where_company=$company;&join_$company_key=company&where_$or@_company_$in@=gap`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('lines_of_code');
        expect(response.body).to.have.property('rows').that.deep.include(["gap", 2015, 496533]);
        expect(response.body).to.have.property('rows').that.deep.include(["gap", 2016, 531062]);
    });
    it('Successful case - datapoints 3D', async () => {
        const query = `_language=en&select_key@=geo&=gender&=age&=time;&value@=population;;&from=datapoints&where_$and@_time=2002;&_geo=$geo;;;&join_$geo_key=geo&where_$or@_geo_$in@=fin`;
        const response = await request(app.callback()).get(`/v2/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.deep.include(['fin', '00_05', 'female', 2002, 6789]);
    });
    it('Successful case - datapoints large', async function() {
        this.timeout(5000);
        const query = `_select_key@=geo&=time&=age&=gender;&value@=population;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_geo_$in@=world&=chn&=rus`;
        const response = await request(app.callback()).get(`/v2/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').to.have.lengthOf(91506);
        expect(response.body).to.have.property('rows').that.deep.include(["chn","85","male",2094,5915063]);
    });
    it('Successful case - datapoints large — ONCE AGAIN, should be faster!', async function() {
        this.timeout(5000);
        const query = `_select_key@=geo&=time&=age&=gender;&value@=population;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_geo_$in@=world&=chn&=rus`;
        const response = await request(app.callback()).get(`/v2/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('rows').to.have.lengthOf(91506);
    });
    it('Successful case - datapoints bomb query population 3D', async () => {
        const query = `_select_key@=geo&=year&=age;&value@=population;;&from=datapoints&where_`;
        const response = await request(app.callback()).get(`/v2/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
        expect(response.body).to.have.property('comment').to.include("bomb query prevented");
    });
    it('Successful case - datapoints bomb query population 4D', async () => {
        const query = `_select_key@=geo&=year&=age&=gender;&value@=population;;&from=datapoints&where_`;
        const response = await request(app.callback()).get(`/v2/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
        expect(response.body).to.have.property('comment').to.include("bomb query prevented");
    });
    it('DDFCSV ddf-query-validator error - invalid "from" clause', async () => {
        const query = `_select_key@=english/_speaking/_company;&value@=name&=rank&=is--english/_speaking/_company;;&from=blablabla`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause must be one of the list: concepts, entities, datapoints,");
    });
    it('DDFCSV ddf-query-validator error - missing "from" clause', async () => {
        const query = `_select_key@=english/_speaking/_company;&value@=name&=rank&=is--english/_speaking/_company;;`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause couldn't be empty");
    });
    it('DDFCSV ddf-query-validator error - wrong dataset requested', async () => {
        const query = `_select_key@=geo&=time&=age;&value@=population;;&from=datapoints&where_$and@_year=2022;&_geo=$geo;;;&join_$geo_key=geo&where_$or@_geo_$in@=world`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Too many query definition errors");
    });
    it('Deliberate crash to create a 500 error', async () => {
        const query = `_test500error:true&select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
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



