# Recovery Replay

A local/testing Laravel demonstration tool for the IBM Bob 2.0 Hackathon.
It reproduces a post-persist HTTP failure followed by a client retry, records
persisted attempt evidence, and emits an `operation_safe` verdict.

Recovery Replay is **this application**, not a drop-in Composer package.
External reuse today means copying a small PHP core and instrumenting the
target endpoint (validated on a separate Invoice app; see below).

---

## What this project is today

| Capability | Status |
| ---------- | ------ |
| Two-attempt in-process replay (`ReplayRunner`) | Supported |
| Persisted evidence evaluation (`PersistedEvidenceEvaluator`) | Supported |
| Built-in Checkout and Reservation scenarios (vulnerable + protected) | Supported |
| CLI: `php artisan replay:run` with JSON reports and exit codes | Supported |
| Browser Investigation Workspace at `/demo` | Supported (`local` / `testing` only) |
| Run History and saved comparisons | Supported (`local` / `testing` only) |
| CI regression gate on protected scenarios | Supported |
| Drop-in Composer package for arbitrary Laravel apps | **Not supported** |
| Production, remote API, or real network-partition replay | **Not supported** |
| Uninstrumented endpoints | Fail closed → `INCONCLUSIVE` |

---

## The problem it demonstrates

A server can persist a business effect and still return an error (or leave the
client uncertain). The client retries. If the endpoint is not idempotent, the
retry creates a duplicate — a second order, charge, reservation, or invoice —
with no obvious error on either side.

Recovery Replay surfaces that class of bug by:

1. Calling the same logical operation twice (attempt 1 with simulated
   post-persist `503`, attempt 2 as the retry).
2. Reading persisted `replay_attempts` rows (not trusting live responses alone).
3. Emitting `reproduction_succeeded` and `operation_safe` for CI or local review.

It does **not** require production traffic. Fault injection is simulated inside
instrumented controllers. Scenarios run against SQLite in `local` / `testing`.

---

## Requirements

- PHP 8.3
- Composer
- Node 22

---

## Installation

```bash
git clone https://github.com/taha-yasin-muhammad/Recovery-Replay.git
cd Recovery-Replay
composer setup
```

`composer setup` runs: `composer install`, `.env` copy if missing,
`php artisan key:generate`, `php artisan migrate --force`, `npm install`,
and `npm run build`.

Ensure `APP_ENV=local` (or `testing`) in `.env`. Demo routes, API endpoints,
and `replay:run` refuse other environments.

---

## Supported workflow

### 1. Browser demo

```bash
composer dev
```

Open **http://localhost:8000/demo** (not the home page — `/` is still the
Laravel starter welcome screen).

From `/demo` you can:

- Run Checkout or Reservation scenarios in vulnerable and protected modes
- Inspect attempt evidence and the safety verdict
- Save a comparison and open **http://localhost:8000/demo/history**

### 2. CLI replay

All combinations accept `--json` for a machine-readable report.

```bash
# Vulnerable checkout — duplicate order expected (exits 1)
php artisan replay:run checkout --mode=vulnerable

# Protected checkout — same order on retry (exits 0)
php artisan replay:run checkout --mode=protected

# Vulnerable reservation — duplicate expected (exits 1)
php artisan replay:run reservation --mode=vulnerable

# Protected reservation — same reservation on retry (exits 0)
php artisan replay:run reservation --mode=protected
```

```bash
php artisan replay:run checkout --mode=protected --json
```

`replay:run` may only run when `APP_ENV` is `local` or `testing`.

### 3. Automated checks

```bash
composer ci:check   # frontend checks, Pint, PHPStan, Pest
php artisan test --compact
```

See [Automated regression](#automated-regression-workflow) for the dedicated
replay CI gate.

---

## Understanding the report fields

### `reproduction_succeeded`

`true` when the two-attempt sequence matched the designed failure mode:

- Attempt 1 recorded HTTP `503` (fault after persist).
- Attempt 2 recorded HTTP `200` or `201`.

If evidence is missing or incomplete, the runner fails closed:
`reproduction_succeeded = false`, verdict `INCONCLUSIVE`.

### `operation_safe`

`true` when reproduction succeeded **and** both attempts share the same
persisted `resource_id`.

| `reproduction_succeeded` | `operation_safe` | Meaning |
| ------------------------ | ---------------- | ------- |
| `false` | `false` | Incomplete / missing evidence — inconclusive |
| `true` | `false` | Replay succeeded — **duplicate created** |
| `true` | `true` | Replay succeeded — idempotency held |

Vulnerable scenarios are expected to exit `1`. Protected scenarios should
exit `0`. CI gates only the protected pair.

---

## Adding an instrumented Laravel scenario

Scenarios only work for endpoints that participate in the evidence contract.

### Endpoint instrumentation (required)

The target handler (local/testing only) must:

1. Accept `run_id`, `attempt_id`, and `inject_fault` (plus domain fields such as
   `operation_id` / `idempotency_key`).
2. Persist the business resource.
3. Write a `replay_attempts` row when `run_id` is present, including
   `resource_type`, `resource_id`, and the HTTP status that will be returned.
4. When `inject_fault` is true, return the simulated post-persist `503`
   (`SimulatedPersistenceFault`) **after** the write.

Without steps 3–4, `ReplayRunner` returns `INCONCLUSIVE`.

### Wire a new scenario in this app

1. Implement [`ReplayScenario`](app/Replay/ReplayScenario.php) under
   `app/Replay/Scenarios/` (see Checkout/Reservation scenarios for the
   in-process `dispatch()` pattern).
2. Register the class in the `SCENARIOS` map in
   [`ReplayRunCommand`](app/Console/Commands/ReplayRunCommand.php).
3. Add a feature test following
   [`ReplayRunCommandTest.php`](tests/Feature/ReplayRunCommandTest.php) or
   [`ReservationScenarioTest.php`](tests/Feature/ReservationScenarioTest.php).

`ReplayRunner` and `PersistedEvidenceEvaluator` need no domain-specific edits
when the evidence rows are complete.

### Using the core in another Laravel app

This is **not** `composer require …`. The verified path is:

1. Copy the domain-generic PHP core (`ReplayScenario`, `ReplayRunner`,
   `PersistedEvidenceEvaluator`, `ReplayAttempt`, `SimulatedPersistenceFault`)
   and a compatible `replay_attempts` schema.
2. Instrument your own endpoint as above.
3. Add an app-specific scenario + CLI map.

That path was validated on a separate Invoice application
([`bob_sessions/external-adoption`](bob_sessions/external-adoption/SUMMARY.md)).

---

## What the evidence supports (and what it does not)

### What Recovery Replay does in this repository

- Reproduce vulnerable vs protected Checkout and Reservation flows locally
- Persist attempt evidence and evaluate safety fail-closed
- Expose CLI + `/demo` investigation UI under `local` / `testing`
- Gate protected replays in GitHub Actions

### What the external Invoice spike proved

Documented in [`bob_sessions/external-adoption/SUMMARY.md`](bob_sessions/external-adoption/SUMMARY.md):

- Separate Laravel Invoice app; `ReplayRunner` / `PersistedEvidenceEvaluator`
  copied unchanged (byte-identical)
- Vulnerable: post-persist `503`, duplicate invoices, unsafe
- Missing evidence: `INCONCLUSIVE`
- Protected: same invoice reused, safe
- Integration required copy + instrumentation — **not** a Composer package

### What remains unsupported or unverified

- Production or non-`local|testing` use
- Real network failures / remote HTTP without shared in-process kernel + DB
- Drop-in packaging for arbitrary brownfield apps
- Porting the demo UI into other applications
- Human user studies (measurement was a scripted experiment)

Controlled timing results (protocol, tables, limitations):
[`docs/MEASUREMENT.md`](docs/MEASUREMENT.md).

Submission checklist and gaps:
[`docs/SUBMISSION.md`](docs/SUBMISSION.md).

---

## Current limitations

**Instrumented endpoints only.** In-process kernel dispatch. Uninstrumented
paths → `INCONCLUSIVE`.

**Simulated post-commit failure.** Controllers honour `inject_fault` after
persist. This models “persisted but not acknowledged” without a real network
partition or proxy.

**SQLite / in-process only.** Not a load test, connection-pool test, or
multi-node concurrency harness.

**Two attempts per run.** Retry storms are not modelled.

**Environment lock.** Demo HTTP routes and `replay:run` are restricted to
`local` and `testing`.

---

## Automated regression workflow

### `tests.yml`

On push/PR to `main`: `composer setup` then `composer ci:check`.

### `replay-regression.yml`

On push/PR to `main`, with `APP_ENV=testing` and SQLite:

1. Migrate
2. `php artisan test --compact`
3. Protected checkout + reservation `replay:run --json`
4. Assert `operation_safe = true` in both reports
5. Upload `replay-reports` artifacts (including on failure)

Vulnerable scenarios are covered by feature tests, not by the CI gate.

Reproduce locally (Unix-style paths; adjust for Windows):

```bash
export APP_ENV=testing
export DB_CONNECTION=sqlite
export DB_DATABASE=/tmp/replay-local.sqlite
touch /tmp/replay-local.sqlite
php artisan migrate --force
php artisan test --compact
php artisan replay:run checkout --mode=protected --json > /tmp/replay-checkout.json
php artisan replay:run reservation --mode=protected --json > /tmp/replay-reservation.json
```

Both commands must exit `0` with `"operation_safe": true`.

---

## Evidence folder

See [`bob_sessions/`](bob_sessions/README.md) for copied measurement artifacts,
the external-adoption summary, and an inventory of still-missing submission
items (including demo video).
