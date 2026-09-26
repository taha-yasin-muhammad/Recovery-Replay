import { expect, test } from '@playwright/test';
import {
    afterPanel,
    attachEvidenceCapture,
    beforePanel,
    goToInvestigationStep,
    openInvestigationWorkspace,
    openSavedComparisonFromHistory,
    runComparison,
    saveComparison,
    selectScenario,
    trackMutatingScenarioPosts,
} from './helpers/workspace';

test.describe('Saved historical comparison (real backend)', () => {
    test('save, reopen, and reload preserve evidence without new scenario POSTs', async ({
        page,
    }) => {
        await openInvestigationWorkspace(page);
        await selectScenario(page, 'Checkout');

        const capture = attachEvidenceCapture(page);
        await runComparison(page);

        const liveRuns = await capture.collectedRuns();
        expect(liveRuns.length).toBeGreaterThanOrEqual(2);

        const beforeLive = liveRuns.find((run) => run.resourceIds.length > 1);
        const afterLive = liveRuns.find((run) => run.resourceIds.length === 1);
        expect(beforeLive).toBeTruthy();
        expect(afterLive).toBeTruthy();

        const comparisonId = await saveComparison(page);

        const mutating = trackMutatingScenarioPosts(page);
        mutating.start();

        await openSavedComparisonFromHistory(page, comparisonId);

        await expect(
            page.getByText(beforeLive!.runId, { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByText(afterLive!.runId, { exact: true }).first(),
        ).toBeVisible();

        await goToInvestigationStep(page, 'Retry');
        for (const id of beforeLive!.resourceIds) {
            await expect(
                beforePanel(page)
                    .getByText(`order #${id}`, { exact: true })
                    .first(),
            ).toBeVisible();
        }
        for (const id of afterLive!.resourceIds) {
            await expect(
                afterPanel(page)
                    .getByText(`order #${id}`, { exact: true })
                    .first(),
            ).toBeVisible();
        }

        await goToInvestigationStep(page, 'Verdict');
        await expect(
            page.getByText('unsafe', { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByText('safe', { exact: true }).first(),
        ).toBeVisible();

        expect(
            mutating.posts,
            'opening a saved comparison must not POST checkout/reservation',
        ).toEqual([]);

        // Full reload drops client-only detail view; reopen from the list.
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Run History' }),
        ).toBeVisible();

        mutating.posts.length = 0;
        await page.getByRole('tab', { name: 'Saved comparisons' }).click();
        await page
            .getByRole('button', { name: comparisonId, exact: true })
            .click();
        await expect(
            page.getByText('Saved comparison', { exact: true }),
        ).toBeVisible();

        await expect(
            page.getByText(beforeLive!.runId, { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByText(afterLive!.runId, { exact: true }).first(),
        ).toBeVisible();

        await goToInvestigationStep(page, 'Retry');
        for (const id of beforeLive!.resourceIds) {
            await expect(
                beforePanel(page)
                    .getByText(`order #${id}`, { exact: true })
                    .first(),
            ).toBeVisible();
        }
        for (const id of afterLive!.resourceIds) {
            await expect(
                afterPanel(page)
                    .getByText(`order #${id}`, { exact: true })
                    .first(),
            ).toBeVisible();
        }

        expect(
            mutating.posts,
            'reloading and reopening must not POST checkout/reservation',
        ).toEqual([]);
    });
});
