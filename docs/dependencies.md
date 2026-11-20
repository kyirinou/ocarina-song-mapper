# Bundled dependencies

This inventory was reviewed on 2026-11-19. `dependencies.json` records exact bundled-file SHA-256 values and version-specific package archives with their published integrity strings. The build checks compare the local files with those recorded hashes. Updating a hash acknowledges a reviewed bundle change.

The inventory review checked source provenance and the upstream advisory pages. It does not constitute a complete security audit. npm’s audit command checks installed package dependencies from the lockfile and does not discover the separately bundled JavaScript files listed here.

| Component | Bundled version | Purpose | License / provenance |
| --- | --- | --- | --- |
| abcjs | 6.7.2 | ABC parsing and staff engraving | MIT, `licenses/abcjs.txt` |
| jsPDF | 4.2.1 | Browser PDF creation | MIT, `licenses/jspdf.txt` |
| svg2pdf.js | 2.5.0 | Vector staff SVG conversion | MIT, `licenses/svg2pdf.txt` |
| PDF.js reader and worker | 3.11.174 | Local PDF import and diagram rendering | Apache-2.0, `licenses/pdfjs.txt` |
| ts-fsrs | 5.4.2 | Flashcard scheduling | MIT, root `FSRS-LICENSE` |
| Open 12 Hole Ocarina 1 | Font dated 2016 | Embedded font and derived fingering outlines | SIL OFL 1.1, `licenses/ocarina-font.txt` |
| oc2 and oc3 audio | User-provided SoundFont extractions | Looping ocarina samples | Source licenses are absent from the repository |

The abcjs and svg2pdf browser files match their package bundles after trimming their surrounding newlines. The PDF.js reader and worker match the recorded package’s minified build files. The FSRS bundle was verified by rebuilding the 5.4.2 package with esbuild 0.28.2 and comparing the result after trimming whitespace. Its entry point is `export {fsrs,createEmptyCard,Rating} from 'ts-fsrs'`, bundled as an IIFE with global name `OSMFSRS` and minification.

## Advisory review

### PDF.js

Version 3.11.174 is in the affected version range for CVE-2024-4367. OSM passes `isEvalSupported: false` to `getDocument`, which is the upstream workaround. The reader and worker still need a coordinated upgrade to a maintained release, including browser and offline PDF tests. This item remains open. [Upstream advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)

CVE-2026-16633 applies to versions starting at 5.6.83 with scripting enabled. The bundled 3.11.174 version is outside the range stated in that advisory. A future update must review both advisories and the current upstream security policy. [Upstream advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)

### jsPDF

The reliability work replaces 3.0.4 with 4.2.1. The downloaded 4.2.1 archive was verified against npm’s published SHA-512 integrity value before copying its browser bundle. Upstream’s 4.2.1 release addresses output-method HTML injection and annotation color injection, following several other security fixes in the 4.x line. OSM uses browser PDF generation and does not call the affected Node filesystem reader. [Upstream release notes](https://github.com/parallax/jsPDF/releases/tag/v4.2.1), [Node-specific advisory](https://github.com/parallax/jsPDF/security/advisories/GHSA-f8cm-6447-x5h2)

### Other libraries

The abcjs, svg2pdf.js, and ts-fsrs upstream security pages listed no published advisories when checked. That observation is limited to those pages and review date. [abcjs security](https://github.com/paulrosen/abcjs/security), [svg2pdf.js security](https://github.com/yWorks/svg2pdf.js/security), [ts-fsrs security](https://github.com/open-spaced-repetition/ts-fsrs/security)

## Update a bundle

1. Check the component’s upstream releases, support policy, advisories, and license.
2. Retrieve a version-specific package archive from the recorded registry source. Verify its integrity against the publisher’s metadata.
3. Copy the appropriate browser build, worker, and license notices. Keep a PDF.js reader and worker on matching versions.
4. Update the version, source archive, package integrity, and local file hashes in `dependencies.json`.
5. Run builds, unit tests, browser import/export regressions, and offline checks. Record the update in `CHANGELOG.md`.

Dependabot proposes npm and GitHub Actions updates. These manually bundled libraries still need this update process. The audio sample provenance needs a maintainer review before making broader licensing claims about the distribution.
