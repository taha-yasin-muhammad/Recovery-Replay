import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(here, '../..');

/** Disposable SQLite file used only by Playwright E2E. Never the app default DB. */
export const E2E_DATABASE_PATH = path.join(
    PROJECT_ROOT,
    'database',
    'e2e.sqlite',
);

export const E2E_HOST = '127.0.0.1';
export const E2E_PORT = 8010;
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;

/**
 * Hard gate: refuse to touch anything that is not the dedicated E2E database.
 */
export function assertE2eDatabasePath(
    candidate: string = E2E_DATABASE_PATH,
): string {
    const resolved = path.resolve(candidate);
    const expected = path.resolve(E2E_DATABASE_PATH);
    const basename = path.basename(resolved);
    const parent = path.basename(path.dirname(resolved));

    if (resolved !== expected) {
        throw new Error(
            `Refusing database reset: path ${resolved} is not the dedicated E2E database ${expected}.`,
        );
    }

    if (basename !== 'e2e.sqlite' || parent !== 'database') {
        throw new Error(
            `Refusing database reset: expected database/e2e.sqlite, got ${resolved}.`,
        );
    }

    if (
        basename === 'database.sqlite' ||
        resolved.includes(`${path.sep}database.sqlite`)
    ) {
        throw new Error(
            'Refusing database reset: refusing to touch database.sqlite (dev/production DB).',
        );
    }

    return resolved;
}

export function e2eServerEnv(): NodeJS.ProcessEnv {
    const database = assertE2eDatabasePath();

    return {
        ...process.env,
        APP_ENV: 'testing',
        APP_DEBUG: 'true',
        APP_KEY:
            process.env.E2E_APP_KEY ??
            'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        APP_URL: E2E_BASE_URL,
        DB_CONNECTION: 'sqlite',
        DB_DATABASE: database,
        DB_URL: '',
        CACHE_STORE: 'array',
        SESSION_DRIVER: 'array',
        QUEUE_CONNECTION: 'sync',
        BROADCAST_CONNECTION: 'null',
        LOG_CHANNEL: 'stderr',
    };
}

export function assertPortIsFree(port: number = E2E_PORT): Promise<void> {
    return new Promise((resolve, reject) => {
        const socket = net.connect({ host: E2E_HOST, port });

        socket.once('connect', () => {
            socket.destroy();
            reject(
                new Error(
                    `E2E port ${E2E_HOST}:${port} is already in use. Refusing to reuse an existing server.`,
                ),
            );
        });

        socket.once('error', () => {
            resolve();
        });
    });
}

export function ensureBuiltAssets(): void {
    const manifest = path.join(
        PROJECT_ROOT,
        'public',
        'build',
        'manifest.json',
    );
    const hot = path.join(PROJECT_ROOT, 'public', 'hot');

    if (fs.existsSync(hot)) {
        throw new Error(
            'public/hot exists. Stop `npm run dev` / Vite before E2E so Laravel serves built assets.',
        );
    }

    if (!fs.existsSync(manifest)) {
        throw new Error(
            'public/build/manifest.json is missing. Run `npm run build` before Playwright E2E.',
        );
    }
}
