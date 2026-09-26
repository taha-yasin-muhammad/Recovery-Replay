import { expect, test } from '@playwright/test';
import {
    afterPanel,
    beforePanel,
    goToInvestigationStep,
    openInvestigationWorkspace,
    runComparison,
    selectScenario,
} from './helpers/workspace';

test.describe('Reservation comparison (real backend)', () => {
    test('Before is unsafe with duplicates; After is safe with reuse', async ({
        page,
    }) => {
        await openInvestigationWorkspace(page);
        await selectScenario(page, 'Reservation');

        await runComparison(page);

        await goToInvestigationStep(page, 'Retry');
        await expect(
            beforePanel(page).getByText(
                'Same logical operation now has two resources.',
            ),
        ).toBeVisible();
        await expect(
            afterPanel(page).getByText(
                'Existing resource returned — no new resource created.',
            ),
        ).toBeVisible();

        await goToInvestigationStep(page, 'Verdict');
        const verdict = page.locator('#investigation-workspace');

        await expect(
            verdict.getByText('unsafe', { exact: true }),
        ).toBeVisible();
        await expect(verdict.getByText('safe', { exact: true })).toBeVisible();
        await expect(verdict.getByText('Duplicate detected')).toBeVisible();
        await expect(
            verdict.getByText('Existing resource reused'),
        ).toBeVisible();
        await expect(verdict.getByText('2 reservations')).toBeVisible();
        await expect(verdict.getByText('1 reservation')).toBeVisible();
        await expect(verdict.getByText('Operation unsafe')).toBeVisible();
        await expect(
            verdict.getByText('Operation safe for the tested retry scenario'),
        ).toBeVisible();
    });
});
