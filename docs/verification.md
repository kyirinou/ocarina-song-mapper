# Reliability verification

These results were recorded for the OSM 0.2.0 reliability update on 2026-11-19.

## Completed checks

| Check | Result |
| --- | --- |
| Unit regressions | 36 passed |
| Chromium browser regressions | 20 passed |
| WebKit browser regressions | 20 passed |
| Scoped ESLint checks | Passed |
| Generated build, syntax, local assets, unique IDs, dependency hashes | Passed |
| Static site packaging and bundled notices | Passed |
| npm development dependency audit | 0 reported vulnerabilities |

The local environment used macOS 27.2, Node.js 26.0.0, Python 3.14.7, and Playwright 1.65.1. The full Chromium/WebKit run finished with 40 passing cases. A later storage recovery edge fix was checked by the unit suite and the focused browser recovery cases.

Coverage includes note conversion and transposition, rhythm, all 21 generated instrument pitches at both common sample rates, legacy project migration, corrupted and interrupted saves, storage failures, competing writers, automatic recovery, imports, piano-roll undo/redo, page layouts and images, rendered PDF note positions and pagination, microphone input through generated Web Audio streams, flashcard persistence, keyboard operation, automated accessibility findings, and offline use.

Run the checks from the repository root:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run build
npm run lint
npm run check
npm run test:unit
OSM_ALL_BROWSERS=1 npm run test:browser -- --project=chromium --project=webkit
npm audit --audit-level=high
npm run package:site
```

Playwright writes reports and failure traces to ignored local directories. GitHub Actions retains reports, traces, and offline build artifacts when its workflow runs.

## Manual browser and device verification

kiri confirmed successful manual testing in Firefox, Safari, and other browsers, and on macOS, Windows, Android, and iOS.

## Hosted automation

[Checks and Pages](https://github.com/kyirinou/ocarina-song-mapper/actions/workflows/checks.yml) runs the unit suite and Chromium, Firefox, and WebKit checks. GitHub Pages uses this workflow and deploys after its checks pass. Each hosted run records its result and downloadable test reports.

The local Playwright Firefox runner initially exited before loading OSM with “Could not find profile folder,” including with a separate temporary directory. Hosted Firefox results are recorded in the workflow above.
