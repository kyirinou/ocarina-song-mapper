# Contributing to OSM

OSM is a browser application for composing and practicing Alto C, 12-hole ocarina music. Small fixes, reproducible bug reports, accessibility improvements, and music-format examples are welcome.

## Set up

Install Node.js 22.12 or newer and Python 3. Clone the repository, then run the following commands from its root.

```sh
npm ci
npx playwright install chromium firefox webkit
npm run build
npm run serve
```

Open the local address printed by the server. Microphone access needs HTTPS or localhost. Opening `osm-offline.html` directly is useful for offline checks.

## Run checks

```sh
npm run lint
npm run check
npm run test:unit
npm run test:browser
```

`npm test` runs the normal checks and test suite. `OSM_ALL_BROWSERS=1 npm run test:browser` also selects the Firefox and WebKit projects. To use an installed Chromium-based browser locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. CI installs its own browsers.

Tests should exercise the code used by the application. Use fixed pitches, durations, and dates when testing music or scheduling. Include a regression test for a bug that affects saved work, interchange, timing, or undo. Keep fixtures small and remove personal information from projects or recordings.

Headless Linux microphone tests need a running audio server for Firefox's Web Audio clock. The GitHub workflow starts PulseAudio with a virtual output before running the tests.

The offline build and browser entry point are generated files. Edit the feature source or pure modules, run `npm run build`, and include the regenerated files in the change. `npm run check` detects stale generated output and changed bundled-library hashes.

## Make a change

1. Open an issue for substantial changes so the behavior and scope can be discussed.
2. Create a branch with a short, descriptive name.
3. Reuse the score model and editing operations. Preserve older project files unless a migration is included.
4. Run the relevant tests, then the normal checks before submitting a pull request.
5. Describe the user-visible behavior, test results, and any remaining limitation. Include before/after screenshots for layout changes.

Use readable names and straightforward functions. Keep pure music and persistence logic in `lib/`. UI feature files live in `source-*.js`. Use explicit imports and exports in the pure modules. Add comments when they explain a timing, storage, or notation constraint. Keep unrelated formatting changes out of a fix.

Review [Architecture and project files](docs/architecture.md), [Browser checks](docs/browser-support.md), and [Release process](docs/releasing.md) before changing those areas.

## Report a bug

Use the Bug report issue form. Include the app version, browser and operating system, exact steps, expected result, and actual result. If a project or music file reproduces the problem, attach a small example you can share publicly. Follow [SECURITY.md](SECURITY.md) for a suspected security vulnerability.

## Attribution

Original OSM code uses the custom [Ocarina Song Mapper License](LICENSE). Keep its notices and identify distributed modified versions as described there. Bundled libraries, font outlines, and audio samples have their own provenance. See [Third-party notices](docs/third-party-notices.md).
