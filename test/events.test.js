import request from 'supertest';
import * as chai from 'chai';
import {app} from '../index.js';

const expect = chai.expect;

const fakeUserReader = { email: "reader@test.com", sub: "73765977-e818-41b4-8855-9a3144290ed9" };

describe('API Routes: EVENTS', () => {
    it('Events require authentication', async () => {
        const response = await request(app.callback()).get("/events");
        expect(response.status).to.equal(401);
    });
    it('Event facets require authentication', async () => {
        const response = await request(app.callback()).get("/events/facets");
        expect(response.status).to.equal(401);
    });
    it('Event facets return distinct values per filterable column', async () => {
        const response = await request(app.callback()).get("/events/facets")
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body).to.have.property('_total').with.keys('uniqueEvents', 'totalCount');
        expect(body).to.have.all.keys('_total', 'type', 'datasetSlug', 'branch', 'status', 'comment', 'asset', 'referer', 'api_version', 'query_from', 'event_code');
        expect(body.status).to.be.an('array');
        expect(body.status[0]).to.have.keys('value', 'totalCount', 'uniqueEvents');
    });
    it('Events can be retrieved with reader auth', async () => {
        const response = await request(app.callback()).get("/events")
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body.length).to.be.greaterThan(10);
    });
    it('Events can be filtered by status', async () => {
        const response = await request(app.callback()).get("/events?status=200")
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body.every(([, record]) => record.status === 200)).to.be.true;
    });
    it('Events can be limited', async () => {
        const response = await request(app.callback()).get("/events?limit=5")
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body.length).to.be.at.most(5);
    });
    it('Events can be filtered by time range (from_latest_ms / to_latest_ms)', async () => {
        const now = Date.now();
        const yesterday = now - 24 * 60 * 60 * 1000;
        // from_latest_ms in the future → no events should match
        const response = await request(app.callback()).get(`/events?from_latest_ms=${now + 10000}`)
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body.length).to.equal(0);
        // from_latest_ms in the past → events from this test session should be included
        const response2 = await request(app.callback()).get(`/events?from_latest_ms=${yesterday}`)
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response2.status).to.equal(200);
        const body2 = JSON.parse(response2.text);
        expect(body2.length).to.be.greaterThan(0);
        expect(body2.every(([, r]) => r.latest_ms >= yesterday)).to.be.true;
    });
    it('Event facets respect time range (from_latest_ms)', async () => {
        const future = Date.now() + 10000;
        const response = await request(app.callback()).get(`/events/facets?from_latest_ms=${future}`)
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.text);
        expect(body._total.uniqueEvents).to.equal(0);
        expect(body._total.totalCount).to.equal(null); // SUM of empty set is NULL in SQLite
    });
    it('Events can be backed up with reader auth', async () => {
        const response = await request(app.callback()).get("/backupevents/test")
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        expect(response.text).to.include('Event backup saved successfully');
    });
    it('Backup events requires authentication', async () => {
        const response = await request(app.callback()).get("/backupevents/test");
        expect(response.status).to.equal(401);
    });
});
