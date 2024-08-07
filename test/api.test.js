import request from 'supertest';
import * as chai from 'chai';
import app from '../index.js'; // Ensure the server file also supports ES6 imports

const expect = chai.expect;

const countryFlagsLatestCommit = "d6ae76ddf1f63b2fb8e816c8bf38b701f587d19f";

describe('API Routes: INFO', () => {
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/info/');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request to get dataset info but no dataset provided");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/info');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request to get dataset info but no dataset provided");
    });
    it('DATASET_NOT_ALLOWED', async () => {
        const response = await request(app.callback()).get('/info/webui/');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not allowed");
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