import { expect, test } from '@playwright/test';
import {
    afterPanel,
    attachEvidenceCapture,
    beforePanel,
    goToInvestigationStep,
    openInvestigationWorkspace,
    runComparison,
    selectScenario,
} from './helpers/workspace';

test.describe('Checkout comparison (real backend)', () => {
    test('Before is unsafe with duplicates; After is safe with reuse; steps navigate', async ({
        page,
    }) => {
        await openInvestigationWorkspace(page);
        await selectScenario(page, 'Checkout');

        const capture = attachEvidenceCapture(page);
        await runComparison(page);

        const runs = await capture.collectedRuns();
        expect(runs.length).toBeGreaterThanOrEqual(2);

        expect(
            runs.some((run) => run.resourceIds.length > 1),
            'expected a run with duplicate resource ids (Before)',
        ).toBeTruthy();
        expect(
            runs.some((run) => run.resourceIds.length === 1),
            'expected a run with a single reused resource id (After)',
        ).toBeTruthy();

        await goToInvestigationStep(page, 'Initial attempt');
        await expect(page.getByText('Current: Initial attempt')).toBeVisible();
        await expect(
            beforePanel(page).getByRole('heading', {
                name: 'Vulnerable checkout',
            }),
        ).toBeVisible();
        await expect(
            afterPanel(page).getByRole('heading', {
                name: 'Protected checkout',
            }),
        ).toBeVisible();

        await goToInvestigationStep(page, 'Retry');
        await expect(page.getByText('Current: Retry')).toBeVisible();
        await expect(
            beforePanel(page).getByText(
                'Same logical operation now has two resources.',
            ),
        ).toBeVisible();
        await expect(
            beforePanel(page).getByText('New resource').first(),
        ).toBeVisible();
        await expect(
            afterPanel(page).getByText(
                'Existing resource returned — no new resource created.',
            ),
        ).toBeVisible();
        await expect(
            afterPanel(page).getByText('Reused resource').first(),
        ).toBeVisible();

        await goToInvestigationStep(page, 'Verdict');
        await expect(
            page.getByRole('heading', { name: 'Verdict' }),
        ).toBeVisible();
        await expect(page.getByText('Current: Verdict')).toBeVisible();

        const verdict = page.locator('#investigation-workspace');

        await expect(
            verdict.getByText('unsafe', { exact: true }),
        ).toBeVisible();
        await expect(verdict.getByText('safe', { exact: true })).toBeVisible();
        await expect(verdict.getByText('Duplicate detected')).toBeVisible();
        await expect(
            verdict.getByText('Existing resource reused'),
        ).toBeVisible();
        await expect(verdict.getByText('2 orders')).toBeVisible();
        await expect(verdict.getByText('1 order')).toBeVisible();
        await expect(verdict.getByText('Operation unsafe')).toBeVisible();
        await expect(
            verdict.getByText('Operation safe for the tested retry scenario'),
        ).toBeVisible();

        // Navigate back via stepper to confirm Initial remains reachable.
        await goToInvestigationStep(page, 'Initial attempt');
        await expect(page.getByText('Current: Initial attempt')).toBeVisible();
    });
});
