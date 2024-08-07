import request from 'supertest';
import * as chai from 'chai';
import app from '../index.js'; // Ensure the server file also supports ES6 imports

const expect = chai.expect;

const countryFlagsLatestCommit = "d6ae76ddf1f63b2fb8e816c8bf38b701f587d19f";
const sgMasterLatestCommit = "a850d17e9e2ce5cf22ca92b55d33e95748a1ca8d";

describe('API Routes: INFO', () => {
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/info');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request to get dataset info but no dataset provided");
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
        expect(response.text).to.include("Received a request to get asset but no dataset provided");
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