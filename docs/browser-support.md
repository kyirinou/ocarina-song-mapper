# Browser and accessibility checks

OSM targets current desktop and mobile browsers with Web Audio, file input/download, Canvas/SVG, and local storage. Microphone features need HTTPS or localhost and permission from the browser. The offline file contains its runtime assets, while microphone availability for a directly opened file depends on the browser.

## Automated coverage

The Playwright configuration defines desktop Chromium, Firefox, and WebKit projects. Use `OSM_ALL_BROWSERS=1 npm run test:browser` for the complete configured set. CI results identify which projects ran and preserve failure reports. A configured project is a test target, and its latest run determines its result.

Browser-engine automation can check imports, editing, saving, downloads, keyboard interaction, and synthetic audio. It does not reproduce every operating system’s microphone prompt, audio driver, screen reader, or touch hardware.

## Manual verification

kiri confirmed that OSM works in Firefox, Safari, and other browsers, and on the following operating systems.

| Environment | Result | Verified by |
| --- | --- | --- |
| macOS | Works | kiri |
| Windows | Works | kiri |
| Android | Works | kiri |
| iOS | Works | kiri |
| Firefox | Works | kiri |
| Safari | Works | kiri |

For future release checks, record the app version, browser version, OS/device, date, tester, and result alongside any reproducible issues.

## Accessibility checks

Automated browser tests use axe to catch serious and critical issues on the covered pages. Keep keyboard tests for opening menus, operating note controls, and navigating dialogs. Fix failures before release, and record any excluded rule with a specific reason.

Manual review should include the following checks.

1. Complete import, note editing, preview export, and manual recognition with the keyboard.
2. Confirm visible focus, sensible tab order, Escape behavior, and focus return when a dialog closes.
3. Check controls and status messages with VoiceOver on Safari and NVDA on a Windows browser.
4. Check 200% zoom, narrow screens, light/dark themes, and reduced motion.
5. Verify that selection, active playback, pitch errors, and correct answers have readable labels or shapes in addition to color.

Automated accessibility results are recorded in the test reports.
