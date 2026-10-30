# Releasing Gaveta

Gaveta uses [Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/). The single source of truth for the version number is the `VERSION` file at the repository root; every `package.json` in the workspace must stay in sync (see `tests/version-sync.test.ts`).

## Prepare a release

1. Choose the next version (`MAJOR.MINOR.PATCH`) and update `VERSION`.
2. Bump every workspace `package.json` `version` field to match `VERSION`.
3. Add a dated section to `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`.
4. Run `pnpm check` on Linux and macOS (CI does both).
5. Commit, push to `main`, and tag the release:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --tags
   ```

## GitHub Release workflow

Pushing a tag matching `v*` triggers `.github/workflows/release.yml`. The job:

1. Checks out the tag.
2. Verifies `VERSION` and all workspace `package.json` files match the tag (without the `v` prefix).
3. Extracts the matching `CHANGELOG.md` section.
4. Creates a GitHub Release with that body.

There is no npm publish yet; distribution is the bash installer (curl) or a git checkout plus symlink to `packages/cli/bin/gaveta.js`. See `install.sh` and [docs/installation.md](installation.md).

## After tagging

Users on a git install can run:

```bash
gaveta update
```

or check only:

```bash
gaveta update --check
```

By default `gaveta update` follows the latest `v*` tag when tags exist (`--channel stable`); use `--channel main` to track `origin/main` instead.

Forks can point `gaveta update` at a different `origin` by setting `GAVETA_UPDATE_REMOTE` to the same URL as `remote.origin.url` (must match exactly after normalization). `gaveta version` always reports the detected git remote and does not enforce the allowlist.
