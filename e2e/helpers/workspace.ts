import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

export type CapturedRunEvidence = {
    runId: string;
    resourceIds: number[];
};

const MUTATING_PATHS = [
    '/api/checkout',
    '/api/checkout/protected',
    '/api/reservations',
    '/api/reservations/protected',
];

export function isMutatingScenarioUrl(url: string): boolean {
    try {
        const pathname = new URL(url).pathname;
        return MUTATING_PATHS.includes(pathname);
    } catch {
        return false;
    }
}

export async function openInvestigationWorkspace(page: Page): Promise<void> {
    await page.goto('/demo');
    await expect(
        page.getByRole('heading', { name: 'Investigation Workspace' }),
    ).toBeVisible();
}

export async function selectScenario(
    page: Page,
    scenario: 'Checkout' | 'Reservation',
): Promise<void> {
    await page.getByRole('tab', { name: scenario, exact: true }).click();
    await expect(
        page.getByRole('tab', { name: scenario, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
}

export async function runComparison(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Run comparison' }).click();
    await expect(
        page.getByRole('button', { name: 'Running comparison…' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Run comparison' }),
    ).toBeEnabled({
        timeout: 90_000,
    });
    await expect(
        page.getByRole('tab', { name: /Initial attempt/ }),
    ).toBeEnabled({ timeout: 90_000 });
}

export async function goToInvestigationStep(
    page: Page,
    step: 'Initial attempt' | 'Retry' | 'Verdict',
): Promise<void> {
    await page.getByRole('tab', { name: new RegExp(step) }).click();
    await expect(
        page.getByRole('tab', { name: new RegExp(step) }),
    ).toHaveAttribute('aria-selected', 'true');
}

export function beforePanel(page: Page) {
    return page.getByRole('region', { name: 'Before comparison' });
}

export function afterPanel(page: Page) {
    return page.getByRole('region', { name: 'After comparison' });
}

/**
 * Capture run_id + resource_ids from live evidence fetches during a comparison.
 * Does not hardcode generated IDs.
 */
export function attachEvidenceCapture(page: Page): {
    collectedRuns: () => Promise<CapturedRunEvidence[]>;
} {
    const captured: CapturedRunEvidence[] = [];
    const pending = new Set<Promise<void>>();

    page.on('response', (response: Response) => {
        const url = response.url();
        if (!/\/api\/replay-runs\/[^/?]+$/.test(new URL(url).pathname)) {
            return;
        }
        if (response.request().method() !== 'GET') {
            return;
        }

        const task = (async () => {
            if (!response.ok()) {
                return;
            }

            const body = (await response.json()) as {
                run_id?: string;
                attempts?: Array<{ resource_id?: number | null }>;
            };

            if (typeof body.run_id !== 'string') {
                return;
            }

            const resourceIds = [
                ...new Set(
                    (body.attempts ?? [])
                        .map((attempt) => attempt.resource_id)
                        .filter(
                            (id): id is number =>
                                typeof id === 'number' &&
                                Number.isInteger(id) &&
                                id > 0,
                        ),
                ),
            ].sort((a, b) => a - b);

            captured.push({ runId: body.run_id, resourceIds });
        })().catch(() => {
            // Ignore parse errors; assertions later will fail clearly.
        });

        pending.add(task);
        void task.finally(() => pending.delete(task));
    });

    return {
        collectedRuns: async () => {
            // Drain response handlers that may still be parsing JSON.
            for (let i = 0; i < 5; i++) {
                await Promise.all(pending);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            return captured;
        },
    };
}

export async function saveComparison(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Save comparison' }).click();
    await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible({
        timeout: 30_000,
    });

    const comparisonIdText = page.getByText(/comparison_id:/);
    await expect(comparisonIdText).toBeVisible();
    const raw = await comparisonIdText.innerText();
    const match = raw.match(/comparison_id:\s*(\S+)/);
    if (!match?.[1]) {
        throw new Error(`Could not parse comparison_id from: ${raw}`);
    }

    return match[1];
}

export async function openSavedComparisonFromHistory(
    page: Page,
    comparisonId: string,
): Promise<void> {
    await page.getByRole('link', { name: 'Run History' }).click();
    await expect(
        page.getByRole('heading', { name: 'Run History' }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Saved comparisons' }).click();
    await expect(
        page.getByRole('tab', { name: 'Saved comparisons' }),
    ).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: comparisonId, exact: true }).click();
    await expect(
        page.getByText('Saved comparison', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText(comparisonId, { exact: true }).first(),
    ).toBeVisible();
}

export function trackMutatingScenarioPosts(page: Page): {
    posts: string[];
    start: () => void;
} {
    const posts: string[] = [];
    let active = false;

    page.on('request', (request) => {
        if (!active) {
            return;
        }
        if (request.method() !== 'POST') {
            return;
        }
        if (isMutatingScenarioUrl(request.url())) {
            posts.push(request.url());
        }
    });

    return {
        posts,
        start: () => {
            active = true;
        },
    };
}
