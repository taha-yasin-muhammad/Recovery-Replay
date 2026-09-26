import { expect, test } from '@playwright/test';
import {
    goToInvestigationStep,
    openInvestigationWorkspace,
    runComparison,
    selectScenario,
} from './helpers/workspace';

/**
 * Isolated presentation test: incomplete attempt evidence must render as
 * inconclusive, never as unsafe. One API intercept supplies controlled
 * incomplete evidence using the real /api/replay-runs/{runId} shape.
 */
test.describe('INCONCLUSIVE presentation (isolated UI)', () => {
    test('missing attempt evidence renders inconclusive, not unsafe', async ({
        page,
    }) => {
        await page.route('**/api/replay-runs/**', async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue();
                return;
            }

            const runId = new URL(route.request().url()).pathname
                .split('/')
                .pop();

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    run_id: runId,
                    attempts: [],
                    orders: [],
                    reservations: [],
                }),
            });
        });

        await openInvestigationWorkspace(page);
        await selectScenario(page, 'Checkout');
        await runComparison(page);

        await goToInvestigationStep(page, 'Verdict');
        const verdict = page.locator('#investigation-workspace');

        await expect(
            verdict.getByText('inconclusive', { exact: true }).first(),
        ).toBeVisible();
        await expect(
            verdict
                .getByText(
                    'Missing, incomplete, or contradictory evidence — safety result is inconclusive.',
                )
                .first(),
        ).toBeVisible();
        await expect(
            verdict
                .getByText(
                    'Inconclusive — evidence does not support a safety conclusion',
                )
                .first(),
        ).toBeVisible();

        await expect(verdict.getByText('unsafe', { exact: true })).toHaveCount(
            0,
        );
        await expect(verdict.getByText('Operation unsafe')).toHaveCount(0);
        await expect(verdict.getByText('Duplicate detected')).toHaveCount(0);
    });
});
