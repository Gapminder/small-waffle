import request from 'supertest';
import * as chai from 'chai';
import {app} from '../index.js';
import errors from '../src/api-errors.js';

const expect = chai.expect;

const fakeUserReader = { email: "reader@test.com", sub: "73765977-e818-41b4-8855-9a3144290ed9" }; 
const fakeUserOwner = { email: "editor@test.com", sub: "66efa603-51ea-4b96-ad9b-4507e87c9d35" };

//Get latest commits
const infoResponse = await request(app.callback()).get('/info')
  .set('x-test-user-sub', fakeUserOwner.sub)
  .set('x-test-user-email', fakeUserOwner.email);
const info = JSON.parse(infoResponse.text);

const dummyMasterLatestFullCommit = info.datasetBranchCommitMapping["_dummy"].master;
const dummyPrivateMainLatestFullCommit = info.datasetBranchCommitMapping["_dummy-private"].main;
const dummyMasterLatestCommit = dummyMasterLatestFullCommit.substr(0,7);
const dummyPrivateMainLatestCommit = dummyPrivateMainLatestFullCommit.substr(0,7);

function getError(key, datasetSlug, branch, commit) {
    const [status, shortMessage, messageExtra] = errors(datasetSlug, branch, commit)[key];
    return {status, shortMessage, messageExtra};
}


describe('API Routes: ASSETS (v2 legacy)', () => {
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
        expect(response.text).to.include("/vizabi/ddf--test--companies/master/assets/waffle.png");
    });
    it('Successful case - JSON asset', async () => {
        const response = await request(app.callback()).get("/vizabi/ddf--test--companies/master/assets/world-50m.json");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('type', 'Topology');
    });
    it('Successful case - PNG asset', async () => {
        const response = await request(app.callback()).get("/vizabi/ddf--test--companies/master/assets/waffle.png");
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


describe('API Routes: DATA (v2 legacy)', () => {
    it('NO_QUERY_PROVIDED 1', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED 2', async () => {
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED 3', async () => {
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
    it('Successful case - datapoints 2D with $not in join where', async () => {
        // english_speaking companies that are NOT foundations:
        //   mic: is--english_speaking_company=true, is--foundation=false → INCLUDED
        //   gap: is--english_speaking_company=true, is--foundation=true  → EXCLUDED by $not
        // This previously crashed with "filter[field].map is not a function" before the $not fix.
        const query = `_language=en&select_key@=company&=year;&value@=lines/_of/_code;;&from=datapoints&where_company=$company;&join_$company_key=company&where_$and@_is--english/_speaking/_company:true;&_$not_is--foundation:true`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('lines_of_code');
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 2015, 62493]);
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 2016, 49595]);
        expect(response.body.rows.map(r => r[0])).to.not.include('gap');
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
    it('Successful case - datapoints large — DEPRECATED V1 API', async function() {
        this.timeout(5000);
        const query = `_select_key@=geo&=time&=age&=gender;&value@=population;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_geo_$in@=world&=chn&=rus`;
        const response = await request(app.callback()).get(`/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
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
    it('DDFCSV ddf-query-validator error - boolean operator $nor given as object, not array', async () => {
        // Without the '@' array sigil, Urlon parses $nor as an object instead of an array.
        // This used to crash the server with "filter[field].map is not a function" → HTTP 500.
        // Fixed in ddf-query-validator >=1.4.5: validateWhereStructure rejects non-array boolean operators.
        const query = `_select_key@=company&=year;&value@=lines/_of/_code;;&from=datapoints&where_$nor_company_$in@=gap`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Too many query structure errors");
        expect(response.text).to.include("operator '$nor' must be an array");
    });
    it('Deliberate crash to create a 500 error', async () => {
        const query = `_test500error:true&select_key@=english/_speaking/_company;&value@=name&=is--english/_speaking/_company;;&from=entities`;
        const response = await request(app.callback()).get(`/v2/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(500);
        expect(response.text).to.include('Internal Server Error');
    });
});
