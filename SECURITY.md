# Security policy

Security fixes target the latest published OSM release. The app runs locally in the browser and accepts music files, images, PDFs, and optional microphone input.

## Report a vulnerability

Use GitHub’s **Security → Report a vulnerability** for this repository when private vulnerability reporting is available. Describe the affected version, a minimal reproduction, impact, and a safe sample file. Keep personal projects and recordings out of a public report.

If the private reporting button is unavailable, open a general issue asking the maintainer to arrange a private channel. Share the technical reproduction after a private channel is established. This repository does not publish a separate security contact address or a guaranteed response time.

## Security boundaries

- Song files and microphone samples are processed in the browser. The app has no upload API, analytics integration, or remote account system.
- Browser storage belongs to the page’s origin and browser profile. Project backups are downloaded files under the user’s control.
- The hosted site loads its own JavaScript, audio samples, notation, and PDF libraries. The browser and hosting provider still handle ordinary page requests.
- Input validation, resource limits, and browser permissions reduce risk. A full independent security audit remains outstanding.

## Dependencies

Bundled runtime libraries are recorded with versions, source URLs, license notices, and SHA-256 hashes in [the dependency inventory](docs/dependencies.md). Development dependencies are pinned by `package-lock.json`, checked by CI, and proposed for update by Dependabot.

The legacy PDF.js reader currently uses the upstream `isEvalSupported: false` mitigation for CVE-2024-4367. It requires a future reader/worker migration to remove that legacy dependency. The inventory records this remaining item and the upstream advisory. jsPDF was updated to 4.2.1 during the 0.2.0 reliability work.

For each dependency update, check upstream advisories, retain licenses, refresh the recorded hashes, and run import/export and offline regressions. See [Release process](docs/releasing.md).
