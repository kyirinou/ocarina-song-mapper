# Reliability verification

These results apply to the local OSM 0.2.0 reliability update on 2026-11-19, based on published commit `72232cc` plus the implementation changes in this workspace.

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

## Automation follow-up

- The installed local Playwright Firefox build exited before loading OSM with “Could not find profile folder.” Retrying with a separate temporary directory produced the same launch error. Firefox remains configured in CI and needs a successful run in a functioning environment.
- The new GitHub workflow has not run remotely. Pages must be switched to GitHub Actions as its deployment source, and required branch checks must be enabled, when this update is published.
