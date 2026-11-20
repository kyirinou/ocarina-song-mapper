# Release process

The package version, app version, and release notes identify a release. Use semantic versions and document project-format changes separately from UI changes.

## Prepare a release

1. Update the version and `CHANGELOG.md`. Describe user-visible changes, migrations, dependency updates, and known limitations.
2. Run `npm ci`, install the configured Playwright browsers, then run `npm test` with `OSM_ALL_BROWSERS=1`.
3. Confirm that `npm run build` regenerates both browser and offline outputs and that `npm run check` accepts them.
4. Check the [dependency inventory](dependencies.md), run `npm audit`, and investigate findings. The npm audit covers the lockfile. Bundled runtime libraries require their own advisory review.
5. Work through the [manual browser matrix](browser-support.md), including actual microphone permission behavior and a saved project from the previous release.
6. Export a backup, reopen it in a fresh browser profile, and compare notes, timing, page layout, and images. Keep the previous release’s offline download available for rollback.
7. Review the pull request and its successful **Checks and Pages** workflow. Merge after required checks pass.

## Repository settings

The workflow gates its Pages deployment job on successful checks. To make this the deployment path, configure **Settings → Pages → Source → GitHub Actions** and disable the previous branch-based Pages build. This is a repository setting, and adding a workflow file does not change it.

Configure a branch rule for `main` requiring pull requests and the checks from **Checks and Pages**. Use the exact job names shown by a successful run. Configure the `github-pages` environment’s deployment branch to `main`. A workflow alone cannot prevent a maintainer from bypassing repository rules.

Private vulnerability reporting must be enabled in repository Security settings to provide the private reporting button described in `SECURITY.md`.

## Publish and verify

1. Verify that the checks completed for the intended commit and that the Pages deployment completed successfully.
2. Open the live site and verify its displayed version. Check a note import, playback, backup export, and page-preview PDF.
3. Download the hosted `osm-offline.html` and compare its hash with the tested artifact.
4. Create an annotated `vX.Y.Z` tag and a GitHub release with the changelog entry and tested offline HTML. Link its test run.
5. Record manual browser/device results and remaining limitations in the release notes.

GitHub Actions results and status badges become evidence after the workflow has run on GitHub. Keep local results distinct from hosted CI results.

## Roll back

Revert the problematic application commit through a reviewed pull request, run the same checks, and redeploy the known working build. Do not replace a newer project schema with an older writer without checking compatibility. Advise affected users to export a backup before trying an older offline release.
