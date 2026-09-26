import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL } from './e2e/helpers/paths';

/**
 * Chromium-only Playwright config for Recovery Replay browser workflows.
 * The webServer command boots Laravel in APP_ENV=testing against database/e2e.sqlite.
 */
export default defineConfig({
    testDir: './e2e',
    testMatch: /.*\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 120_000,
    expect: {
        timeout: 30_000,
    },
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ],
    outputDir: 'test-results',
    use: {
        baseURL: E2E_BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        locale: 'en-US',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                channel: undefined,
            },
        },
    ],
    webServer: {
        command: 'node e2e/scripts/start-server.mjs',
        url: `${E2E_BASE_URL}/up`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
