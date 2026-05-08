import request from 'supertest';
import * as chai from 'chai';
import {app, server} from '../index.js';
import errors from '../src/api-errors.js';

const expect = chai.expect;

const fakeUserReader = { email: "reader@test.com", sub: "73765977-e818-41b4-8855-9a3144290ed9" }; 
const fakeUserEditor = { email: "editor@test.com", sub: "5b11e190-3e5e-418b-802b-343776ac399c" };
const fakeUserOwner = { email: "editor@test.com", sub: "66efa603-51ea-4b96-ad9b-4507e87c9d35" };

//Get latest commits
const statusResponse = await request(app.callback()).get('/status');
const status = JSON.parse(statusResponse.text);

const infoResponse = await request(app.callback()).get('/info')
  .set('x-test-user-sub', fakeUserOwner.sub)
  .set('x-test-user-email', fakeUserOwner.email);
const info = JSON.parse(infoResponse.text);

const dummyMasterLatestFullCommit = info.datasetBranchCommitMapping["_dummy"].master;
const dummyPrivateMainLatestFullCommit = info.datasetBranchCommitMapping["_dummy-private"].main;
const dummyMasterLatestCommit = dummyMasterLatestFullCommit.substr(0,7);
const dummyPrivateMainLatestCommit = dummyPrivateMainLatestFullCommit.substr(0,7);

//Global after hook to stop server after running tests
after(done => {
    server.close(done);
});

function getError(key, datasetSlug, branch, commit) {
    const [status, shortMessage, messageExtra] = errors(datasetSlug, branch, commit)[key];
    return {status, shortMessage, messageExtra};
}

describe('API Routes: STATUS', () => {
    it('Status has server info', async () => {
        expect(status).to.have.nested.property('type', 'small-waffle');
    });
    it('Status has reader info', async () => {
        expect(status).to.have.nested.property('DDFCSVReaderVersionInfo.package.name', "@vizabi/reader-ddfcsv");
    });
});


describe('API Routes: SYNC', () => {
  it('Sync dataset but not logged in', async () => {
    const {status, shortMessage} = getError("SYNC_UNAUTHORIZED", "_dummy");
    const response = await request(app.callback()).get("/sync/_dummy");
    expect(response.status).to.equal(status);
    expect(response.text).to.include(shortMessage);
  });
  it('Sync dataset with unknown dataset', async () => {
    const {status, shortMessage} = getError("DATASET_NOT_CONFIGURED", "unknownsomething");
    const response = await request(app.callback()).get("/sync/unknownsomething")
      .set('x-test-user-sub', fakeUserEditor.sub)
      .set('x-test-user-email', fakeUserEditor.email);
    expect(response.status).to.equal(status);
    expect(response.text).to.include(shortMessage);
  });
  it('Sync dataset with unknown branch', async () => {
    const {status, shortMessage} = getError("BRANCH_NOT_CONFIGURED", "_dummy", "unknownsomething");
    const response = await request(app.callback()).get("/sync/_dummy/unknownsomething")
      .set('x-test-user-sub', fakeUserEditor.sub)
      .set('x-test-user-email', fakeUserEditor.email);
    expect(response.status).to.equal(status);
    expect(response.text).to.include(shortMessage);
  });
  it('Sync one dataset _dummy', async () => {
    const response = await request(app.callback()).get("/sync/_dummy")
      .set('x-test-user-sub', fakeUserEditor.sub)
      .set('x-test-user-email', fakeUserEditor.email);
    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('ongoing');
  });
});


describe('API Routes: INFO', () => {
    it('Info without login returns empty DCL and empty BCM', async () => {        
      const infoResponse = await request(app.callback()).get('/info')
      const info = JSON.parse(infoResponse.text);
      expect(infoResponse.status).to.equal(200);
      expect(info).to.have.property('datasetControlList').that.has.length(0);
      expect(info).to.have.property('datasetBranchCommitMapping').that.is.empty;
    });
    it('Info has _dummy in DCL', async () => {        
        expect(info.datasetControlList).to.deep.include({
            slug: "_dummy",
            githubRepoId: "vizabi/ddf--test--companies",
            branches: ["master", "develop"],
            default_branch: "master",
            is_private: false,
            waffleFetcherAppInstallationId: null
        });
    });
    it('Info has _dummy in BCM', async () => {
        expect(info.datasetBranchCommitMapping).to.have.nested.property("_dummy.master", dummyMasterLatestFullCommit);
    });
    it('Info has commitTimeStamp for _dummy branches as ISO timestamps', async () => {
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
        expect(info.commitTimeStamp).to.have.nested.property("_dummy.master").that.matches(isoRegex);
        expect(info.commitTimeStamp).to.have.nested.property("_dummy.develop").that.matches(isoRegex);
    });
    it('Info has commitAuthor for _dummy branches as non-empty strings', async () => {
        expect(info.commitAuthor).to.have.nested.property("_dummy.master").that.is.a('string').and.not.empty;
        expect(info.commitAuthor).to.have.nested.property("_dummy.develop").that.is.a('string').and.not.empty;
    });
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get('/info/webui');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/info/_dummy')
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/info/_dummy/unknownsomething')
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master')
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master/unknowncommit')
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include("/info/_dummy/master/" + dummyMasterLatestCommit);
    });
    it('Successful case - info', async () => {
        const response = await request(app.callback()).get('/info/_dummy/master/'+dummyMasterLatestCommit)
          .set('x-test-user-sub', fakeUserReader.sub)
          .set('x-test-user-email', fakeUserReader.email);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('name', 'ddf--test--companies-name-in-datapackage');
    });
});


describe('API Routes: ASSETS (v3)', () => {
    it('ASSET_NOT_PROVIDED', async () => {
        const response = await request(app.callback()).get("/v3/_dummy/assets/");
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No asset provided in the route");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get('/v3/assets/waffle.png');
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get('/v3/ritakukar/assets/waffle.png');
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get('/v3/_dummy/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get('/v3/_dummy/unknown/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get('/v3/_dummy/master/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get('/v3/_dummy/master/unknowncommit/assets/waffle.png');
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(dummyMasterLatestCommit+"/assets/waffle.png");
    });
    it('Redirecting to target asset', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}/assets/waffle.png`);
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



describe('API Routes: DATA (v3)', () => {
    it('NO_QUERY_PROVIDED 1', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED 2', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('NO_QUERY_PROVIDED 3', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?x`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("No query provided");
    });
    it('QUERY_PARSING_ERROR', async () => {
        // v2-style query starting with '_' is an unexpected char for urlon v3
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?_select_key@=key&=value;&value@;;&from=concepts.schema_`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Query failed to parse");
    });
    it('NO_DATASET_GIVEN', async () => {
        const response = await request(app.callback()).get(`/v3/?$select$key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Received a request with no dataset provided");
    });
    it('DATASET_NOT_CONFIGURED', async () => {
        const response = await request(app.callback()).get(`/v3/webui?$select$key@=key&=value;&value@;;&from=concepts.schema`);
        expect(response.status).to.equal(403);
        expect(response.text).to.include("Dataset not configured");
    });
    it('Redirect when branch is not given', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy?$select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?$select`);
    });
    it('Redirect when branch is unknown', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/unknown?$select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?$select`);
    });
    it('Redirect when branch is a known branch', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master?$select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?$select`);
    });
    it('Redirect when commit is unknown', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/unknowncommit?$select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`);
        expect(response.status).to.equal(302);
        expect(response.text).to.include('Redirecting to');
        expect(response.text).to.include(`/_dummy/master/${dummyMasterLatestCommit}?$select`);
    });
    it('Successful case - entities', async () => {
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?$select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('english_speaking_company');
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 'Microsoft', 1]);
        expect(response.body).to.have.property('rows').that.deep.include(['gap', 'Gapminder', 1]);
    });
    it('Successful case - datapoints 2D', async () => {
        const query = `$language=en&select$key@=company&=year;&value@=lines_of_code;;&from=datapoints&where$company=$company;&join$/$company$key=company&where$/$or@$company$/$in@=gap`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
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
        const query = `$language=en&select$key@=company&=year;&value@=lines_of_code;;&from=datapoints&where$company=$company;&join$/$company$key=company&where$/$and@$is--english_speaking_company:true;&$/$not$is--foundation:true`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('lines_of_code');
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 2015, 62493]);
        expect(response.body).to.have.property('rows').that.deep.include(['mic', 2016, 49595]);
        expect(response.body.rows.map(r => r[0])).to.not.include('gap');
    });
    it('Successful case - datapoints 3D', async () => {
        const query = `$select$key@=geo&=gender&=age&=time;&value@=population;;&from=datapoints&where$/$and@$time=2002;&$geo=$geo;;;&join$/$geo$key=geo&where$/$or@$geo$/$in@=fin`;
        const response = await request(app.callback()).get(`/v3/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.deep.include(['fin', '00_05', 'female', 2002, 6789]);
    });
    it('Successful case - datapoints large', async function() {
        this.timeout(5000);
        const query = `$select$key@=geo&=time&=age&=gender;&value@=population;;&from=datapoints&where$geo=$geo;&join$/$geo$key=geo&where$/$or@$geo$/$in@=world&=chn&=rus`;
        const response = await request(app.callback()).get(`/v3/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').to.have.lengthOf(91506);
        expect(response.body).to.have.property('rows').that.deep.include(["chn","85","male",2094,5915063]);
    });
    it('Successful case - datapoints large — ONCE AGAIN, should be faster!', async function() {
        this.timeout(5000);
        const query = `$select$key@=geo&=time&=age&=gender;&value@=population;;&from=datapoints&where$geo=$geo;&join$/$geo$key=geo&where$/$or@$geo$/$in@=world&=chn&=rus`;
        const response = await request(app.callback()).get(`/v3/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('rows').to.have.lengthOf(91506);
    });
    it('Successful case - datapoints bomb query population 3D', async () => {
        const query = `$select$key@=geo&=year&=age;&value@=population;;&from=datapoints&where$`;
        const response = await request(app.callback()).get(`/v3/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
        expect(response.body).to.have.property('comment').to.include("bomb query prevented");
    });
    it('Successful case - datapoints bomb query population 4D', async () => {
        const query = `$select$key@=geo&=year&=age&=gender;&value@=population;;&from=datapoints&where$`;
        const response = await request(app.callback()).get(`/v3/_dummy-private/main/${dummyPrivateMainLatestCommit}?${query}`);
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('object');
        expect(response.body).to.have.property('header').that.includes('population');
        expect(response.body).to.have.property('rows').that.is.an('array').that.is.empty;
        expect(response.body).to.have.property('comment').to.include("bomb query prevented");
    });
    it('DDFCSV ddf-query-validator error - invalid "from" clause', async () => {
        const query = `$select$key@=english_speaking_company;&value@=name&=rank&=is--english_speaking_company;;&from=blablabla`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause must be one of the list: concepts, entities, datapoints,");
    });
    it('DDFCSV ddf-query-validator error - missing "from" clause', async () => {
        const query = `$select$key@=english_speaking_company;&value@=name&=rank&=is--english_speaking_company`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("* 'from' clause couldn't be empty");
    });
    it('DDFCSV ddf-query-validator error - wrong dataset requested', async () => {
        const query = `$select$key@=geo&=time&=age;&value@=population;;&from=datapoints&where$/$and@$year=2022;&$geo=$geo;;;&join$/$geo$key=geo&where$/$or@$geo$/$in@=world`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Too many query definition errors");
    });
    it('DDFCSV ddf-query-validator error - boolean operator $nor given as object, not array', async () => {
        // Without the '@' array sigil, urlon v3 parses $nor as an object instead of an array.
        const query = `$select$key@=company&=year;&value@=lines_of_code;;&from=datapoints&where$/$nor$company$/$in@=gap`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(400);
        expect(response.text).to.include("Too many query structure errors");
        expect(response.text).to.include("operator '$nor' must be an array");
    });
    it('Deliberate crash to create a 500 error', async () => {
        const query = `$test500error:true&select$key@=english_speaking_company;&value@=name&=is--english_speaking_company;;&from=entities`;
        const response = await request(app.callback()).get(`/v3/_dummy/master/${dummyMasterLatestCommit}?${query}`);
        expect(response.status).to.equal(500);
        expect(response.text).to.include('Internal Server Error');
    });
});
