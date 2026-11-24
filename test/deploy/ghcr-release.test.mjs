import assert from "node:assert/strict";
import test from "node:test";
import * as api from "../../.github/scripts/publish-image.mjs";

const app = "small-waffle";
  test(app + ": version tags must match the committed package version", () => {
    assert.equal(api.releaseVersion("4.0.1", "v4.0.1"), "4.0.1");
    assert.equal(api.releaseVersion("4.0.1-rc.1"), "4.0.1-rc.1");
    assert.throws(() => api.releaseVersion("4.0.1", "v4.0.0"));
    for (const version of ["latest", "../bad", "4.0.1+local", undefined]) {
      assert.throws(() => api.releaseVersion(version));
    }
  });
  test(app + ": only an authenticated manifest 404 permits a new release", async () => {
    for (const status of [200, 404, 401, 403, 429, 500]) {
      const calls = [];
      const options = {
        user: "fixture-user", token: "fixture-only",
        request: async (url, init) => {
          calls.push({ url, init });
          return calls.length === 1
            ? new Response(JSON.stringify({ token: "fixture-bearer" }), { status: 200 })
            : new Response(null, { status });
        },
      };
      if (status === 200 || status === 404) {
        assert.equal(await api.releaseExists("gapminder/example", "1.0.0", options), status === 200);
      } else {
        await assert.rejects(api.releaseExists("gapminder/example", "1.0.0", options), /lookup failed/);
      }
      assert.equal(calls[1].init.method, "HEAD");
      assert.equal(calls[1].init.headers.Authorization, "Bearer fixture-bearer");
      assert.equal(calls[1].url, "https://ghcr.io/v2/gapminder/example/manifests/1.0.0");
    }
  });
  test(app + ": missing credentials and registry authentication failures stop lookup", async () => {
    let calls = 0;
    await assert.rejects(api.releaseExists("gapminder/example", "1.0.0", {}), /required/);
    await assert.rejects(api.releaseExists("gapminder/example", "1.0.0", {
      user: "fixture-user", token: "fixture-only",
      request: async () => { calls++; return new Response(null, { status: 403 }); },
    }), /authentication failed/);
    assert.equal(calls, 1);
  });
