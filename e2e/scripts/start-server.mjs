import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, '../..');
const E2E_DATABASE_PATH = path.join(PROJECT_ROOT, 'database', 'e2e.sqlite');
const E2E_HOST = '127.0.0.1';
const E2E_PORT = Number(process.env.E2E_PORT ?? 8010);
const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;

function assertE2eDatabasePath(candidate = E2E_DATABASE_PATH) {
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

    if (basename === 'database.sqlite') {
        throw new Error(
            'Refusing database reset: refusing to touch database.sqlite.',
        );
    }

    console.log(`[e2e] Verified disposable database path: ${resolved}`);
    return resolved;
}

function assertPortIsFree(port) {
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

function ensureBuiltAssets() {
    const manifest = path.join(
        PROJECT_ROOT,
        'public',
        'build',
        'manifest.json',
    );
    const hot = path.join(PROJECT_ROOT, 'public', 'hot');

    if (fs.existsSync(hot)) {
        throw new Error(
            'public/hot exists. Stop Vite (`npm run dev`) before E2E so Laravel serves built assets.',
        );
    }

    if (!fs.existsSync(manifest)) {
        throw new Error(
            'public/build/manifest.json is missing. Run `npm run build` before Playwright E2E.',
        );
    }
}

function run(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: PROJECT_ROOT,
            env,
            stdio: 'inherit',
            shell: false,
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `${command} ${args.join(' ')} exited with code ${code}`,
                    ),
                );
            }
        });
    });
}

async function resetDatabase(env) {
    const database = assertE2eDatabasePath(env.DB_DATABASE);

    if (fs.existsSync(database)) {
        fs.unlinkSync(database);
        console.log(`[e2e] Removed previous E2E database at ${database}`);
    }

    fs.writeFileSync(database, '');
    console.log(`[e2e] Created empty E2E database at ${database}`);

    await run(
        'php',
        ['artisan', 'migrate', '--force', '--no-interaction'],
        env,
    );
    console.log('[e2e] Migrations applied to E2E database');
}

async function main() {
    ensureBuiltAssets();
    await assertPortIsFree(E2E_PORT);

    const database = assertE2eDatabasePath();
    const env = {
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

    await resetDatabase(env);

    console.log(
        `[e2e] Starting Laravel (APP_ENV=testing) on ${E2E_BASE_URL} with DB ${database}`,
    );

    const server = spawn(
        'php',
        [
            'artisan',
            'serve',
            `--host=${E2E_HOST}`,
            `--port=${E2E_PORT}`,
            '--no-reload',
        ],
        {
            cwd: PROJECT_ROOT,
            env,
            stdio: 'inherit',
            shell: false,
        },
    );

    const shutdown = () => {
        if (!server.killed) {
            server.kill('SIGTERM');
        }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);

    server.on('exit', (code) => {
        process.exit(code ?? 1);
    });
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
