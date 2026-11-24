# Publishing the container

The Dockerfile and release workflow belong to this app.

## One-time GitHub setup

1. Commit and push the new Dockerfile, `docker/` files where present, `.dockerignore`, and `.github/` files in **each app repo**. The default branch must contain the workflow for its Run workflow button to appear. There is no dependency on publishing `vizabi/deploy` first.
2. Make sure GitHub Actions is enabled in the repos and allowed by their organization policies. Allow the official `actions/checkout`, `docker/setup-qemu-action`, and `docker/setup-buildx-action` actions. The workflow requests `contents: read` and `packages: write`. It uses GitHub's temporary `GITHUB_TOKEN`, so no personal registry token or Supabase secrets need to be stored in Actions.
3. If organization policy restricts package creation, allow creation of the intended private packages. New GHCR packages are private by default; review the generated package's permissions after its first release. Keep Verkstad private unless you deliberately decide otherwise.
4. If a package with the intended name already exists, give its source repo Actions access to that package in the package settings before the workflow runs.

[GitHub's publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) describes the token and permissions. GHCR storage and bandwidth are currently free; private-repo Actions uses the owner's included allowance and subsequent metered usage. Set a GitHub spending budget if needed. [Billing](https://docs.github.com/en/enterprise-cloud%40latest/billing/concepts/product-billing/github-packages).

## Release an app

For the first migration, you can keep its current app version: an image with that version in Docker Hub does not conflict with a new GHCR image. To publish without adding a tag, open the app repo's **Actions → Publish container → Run workflow** and select the committed branch.

For subsequent releases, bump `package.json`, commit and push the code, then push a matching Git tag. From the app checkout:

```sh
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin "v$VERSION"
```

Only create a tag that does not already exist. A tag-triggered workflow requires that tag to match `package.json`. Ordinary branch pushes and pull requests do not publish images.

The workflow:

1. Requires a clean checkout and validates the version.
2. Checks the version tag in GHCR. An existing tag skips the whole release, leaving `latest` untouched. Failed authentication or an unexpected registry response stops the job.
3. Builds and loads each architecture in isolation. It checks nginx startup for the frontends and the native SQLite module for Waffle.
4. Checks that the version is still absent, then pushes a multi-platform version tag.
5. Points `latest` to the pushed digest and writes that digest in the workflow summary.

Releases are serialized per repo, without canceling the running build. Run releases in version order: `latest` means the last successfully published version, not a semantic-version maximum. There is no automatic Dokploy deployment. Keep tags unique and use the printed digest when reproducing an installation. The preflight checks are not a registry-enforced lock against someone manually pushing the same tag elsewhere. If pushing succeeds but promotion fails, the version remains published and reruns skip it; inspect the workflow before any deliberate repair of `latest`.

The runtime checks do not replace a test deployment, authenticated browser checks, or a real Waffle dataset query. npm dependencies currently resolve without committed lockfiles; the published image digest is the exact tested artifact, not a guarantee that a later rebuild will be identical.


For registry credentials and installation changes, see the [deployment GHCR guide](https://github.com/vizabi/deploy/blob/main/GHCR.md).
