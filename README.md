# Small-waffle

A Node.js server for querying DDFCSV datasets from Git repositories. The API loads datasets from disk, while a separate Git worker clones, updates, and validates them.

## Run standalone

Install Node.js and npm, then run:

```sh
npm install
cp .env.example .env
```

Set `SERVER_ID` to the server identifier used in your dataset control list. Choose one source:

- **Supabase:** Set `GET_ALLOWED_DATASETS_FROM=supabase_db`, `SUPABASE_ENDPOINT` (hostname without `https://`), and `SUPABASE_SERVICE_ROLE_KEY`. Set `SUPABASE_JWT_SECRET` to your project's existing HS256 JWT secret for signed-in access. These are server-only credentials.
- **Public Google spreadsheet:** Set `GET_ALLOWED_DATASETS_FROM=google_spreadsheet` and set either `ALLOWED_DATASETS_GOOGLE_SPREADSHEET_ID` or `ALLOWED_DATASETS_GOOGLE_SPREADSHEET_PUBLISH_ON_WEB_ID`. The sheet must be readable as CSV. Include the headers `server,id,github_repo_id,branches,default_branch,is_private,waffle_fetcher_app_installation_id`. Set `server` to your ID or `__all__`, quote comma-separated branches, and use `FALSE` for public datasets.

Set `SIDECAR_SECRET` to a random shared value for the API and worker (for example, generate one with `openssl rand -hex 32`). Set `GITHUB_TOKEN` if you need authenticated GitHub API lookups. Use the existing GitHub App settings for repositories that require them.

For development:

```sh
npm start
```

This starts the API on port `4444` and the Git worker on loopback port `4445`. Open <http://localhost:4444/status>. For a standalone production install, keep the existing PM2 setup: install PM2, adjust the log paths in [pm2.config.cjs](pm2.config.cjs), and run `npm run serve`. It uses ports `3333` and `3334` by default. If serving publicly, route HTTPS to the API only. Keep one API and one Git worker per writable dataset directory.

Both processes read `.env` if present. They can also read settings directly from their process environment. Preserve `datasets/`, `events/`, and `backup/` across deployments. Verify a real dataset query after startup; `/status` alone does not check every dataset. Authorized operators can sync datasets from Verkstad.

## Run in Docker or Dokploy

Use the [Waffle pilot runbook in vizabi/deploy](https://github.com/vizabi/deploy/blob/main/WAFFLE.md) for the image build, Compose file, persistent volumes, and Dokploy setup. The container starts both processes and only exposes the API on port `3333`. Supply settings in the deployment environment; no `.env` is baked into the image.

The first container deployment is **public-dataset-only** and should run alongside existing Waffle instances with its own server ID and volumes. The current standalone private-data deployment is not part of this pilot.

# USAGE
//concept request
http://localhost:4444/fasttrack?_language=sv-SE&select_key@=concept;&value@=concept/_type&=name;;&from=concepts

the link should redirect from `/fasttrack` to `/fasttrack/master/COMMIT_HASH`
and return a JSON object such as
```
{
    "header": [
        "concept",
        "concept_type",
        "name"
    ],
    "rows": [
    [
        "gini",
        "measure",
        "Gini coefficient"
    ],[
        "journakilled",
        "measure",
        "Number of journalists killed"
    ],
    ...
```


//entity request
http://localhost:4444/fasttrack/master?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true
http://localhost:3333/fasttrack/23e4dd45525ad1d0b7344f4935b7191972cf2ba1?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true
http://localhost:3333/fasttrack?_language=en&select_key@=geo;&value@=world/_4region&=is--world/_4region;;&from=entities&where_$or@_un/_state:true

//example of a datapoint request
http://localhost:3333/fasttrack/master?_language=en&select_key@=geo&=time;&value@=pop&=lex&=gdp/_pcap;;&from=datapoints&where_geo=$geo;&join_$geo_key=geo&where_$or@_un/_state:true

//example of a concept schema request
http://localhost:3333/fasttrack/master?_select_key@=key&=value;&value@;;&from=concepts.schema

//example of a datapoint schema request
http://localhost:3333/fasttrack/master?_select_key@=key&=value;&value@;;&from=datapoints.schema
