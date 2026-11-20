const { defineConfig, devices } = require('@playwright/test');

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.OSM_BROWSER_EXECUTABLE;
const allBrowsers = process.env.OSM_ALL_BROWSERS === '1';

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: chromiumExecutable ? 'off' : 'retain-on-failure',
    acceptDownloads: true
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : {}
      }
    },
    ...(allBrowsers ? [
      {
        name: 'firefox',
        use: {
          ...devices['Desktop Firefox'],
          // Generated microphone streams do not receive a real capture permission grant.
          launchOptions: {
            firefoxUserPrefs: {
              'media.autoplay.default': 0,
              'media.autoplay.block-webaudio': false
            }
          }
        }
      },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } }
    ] : [])
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
