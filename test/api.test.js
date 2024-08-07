import request from 'supertest';
import * as chai from 'chai';
import {app, server} from '../index.js';

const expect = chai.expect;

const countryFlagsLatestCommit = "d6ae76d";
const sgMasterLatestCommit = "a850d17";

//Global after hook to stop server after running tests
after(done => {
    server.close(done);
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
    it('Redirect when version is not given', async () => {
        const response = await request(app.callback()).get('/info/country-flags');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(countryFlagsLatestCommit);
    });
    it('Redirect when version is unknown', async () => {
        const response = await request(app.callback()).get('/info/country-flags/unknownsomething');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(countryFlagsLatestCommit);
    });
    it('Redirect when version is a known branch', async () => {
        const response = await request(app.callback()).get('/info/country-flags/master');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(countryFlagsLatestCommit);
    });
    it('Successful case', async () => {
        const response = await request(app.callback()).get('/info/country-flags/'+countryFlagsLatestCommit);
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
    it('Redirect when version is not given', async () => {
        const response = await request(app.callback()).get('/sg-master/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirect when version is unknown', async () => {
        const response = await request(app.callback()).get('/sg-master/unknown/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirect when version is a known branch', async () => {
        const response = await request(app.callback()).get('/sg-master/master/assets/world-50m.json');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"/assets/world-50m.json");
    });
    it('Redirecting to target asset', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}/assets/world-50m.json`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/open-numbers/ddf--gapminder--systema_globalis/master/assets/world-50m.json");
    });
    it('Successful case JSON', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--systema_globalis/master/assets/world-50m.json");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('type', 'Topology');
    });
    it('Successful case PNG', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--billionaires/stage/assets/elon_musk.png");
        expect(response.status).to.equal(200);
        expect(response.headers['content-type']).to.include('image/png');
        expect(response.headers).to.have.property('content-length');
        expect(parseInt(response.headers['content-length'], 10)).to.be.above(0);
        expect(Buffer.isBuffer(response.body)).to.be.true;
    });
    it('Missing asset PNG', async () => {
        const response = await request(app.callback()).get("/open-numbers/ddf--gapminder--billionaires/stage/assets/missing_asset.png");
        expect(response.status).to.equal(404);
        expect(response.text).to.include('Not Found');
    });

});



describe('API Routes: DATA', () => {
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('QUERY_PARSING_ERROR', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_select_key@=key&=value;&value@;;&from=concepts.schema_`);
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
    it('Redirect when version is not given', async () => {
        const response = await request(app.callback()).get(`/sg-master?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"?_select_key");
    });
    it('Redirect when version is unknown', async () => {
        const response = await request(app.callback()).get(`/sg-master/unknown?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"?_select_key");
    });
    it('Redirect when version is a known branch', async () => {
        const response = await request(app.callback()).get(`/sg-master/master?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(sgMasterLatestCommit+"?_select_key");
    });
    it('Successful case', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('world_4region');
        expect(response.body).to.have.property('rows').that.deep.include(['africa', 1, 'Africa', 2]);
    });
    it('DDFCSV ddf-query-validator error', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=blablabla`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause must be one of the list: concepts, entities, datapoints,");
    });
    it('DDFCSV ddf-query-validator error', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause couldn't be empty");
    });
    it('Unknown DDFCSV reader error', async () => {
        const response = await request(app.callback()).get(`/sg-master/${sgMasterLatestCommit}?_test500error:true&select_key@=world/_4region;&value@=name&=rank&=is--world/_4region;;&from=entities`);
        expect(response.status).to.equal(500);
        expect(response.text).to.include('Internal Server Error');
    });


});