# Recovery Replay

A demonstration tool for the IBM Bob 2.0 Hackathon that shows how to detect
non-idempotent HTTP operations before they reach production — by replaying
recorded API calls and comparing what the server did the first time against
what it does on a retry.

---

## The Problem

In distributed systems, network failures happen after a server has already
processed a request but before the response reaches the client. The client
has no choice but to retry. If the endpoint is not idempotent, that retry
creates a duplicate record — a second order, a double-charge, a ghost
reservation — with no error visible to either side.

Recovery Replay surfaces this class of bug by:

1. Calling the same endpoint twice with the same payload (simulating a
   client retry after a `503`).
2. Comparing the resource IDs that each attempt produces.
3. Emitting a structured `operation_safe` verdict that can gate a CI build.

The tool does **not** require production traffic. It runs entirely in a
`testing` environment against an in-memory SQLite database, with no external
services.

---

## Installation

**Requirements:** PHP 8.3, Composer, Node 22.

```bash
git clone https://github.com/your-org/recovery-replay.git
cd recovery-replay
composer setup          # installs deps, copies .env, runs migrations, builds assets
```

`composer setup` runs: `composer install`, `.env` copy, `php artisan key:generate`,
`php artisan migrate`, `npm install`, and `npm run build`.

---

## Running the demo locally

Start the development server:

```bash
composer dev
```

Then open `http://localhost:8000`. The demo page lets you run each scenario
from the browser. To drive the same scenarios from the command line, use the
Artisan commands below.

---

## Artisan commands

All four combinations accept `--json` to write a machine-readable report
instead of the formatted table.

```bash
# Vulnerable checkout — creates a duplicate order on retry (exits 1)
php artisan replay:run checkout --mode=vulnerable

# Protected checkout — idempotency holds, one order, exits 0
php artisan replay:run checkout --mode=protected

# Vulnerable reservation — creates a duplicate reservation on retry (exits 1)
php artisan replay:run reservation --mode=vulnerable

# Protected reservation — idempotency holds, one reservation, exits 0
php artisan replay:run reservation --mode=protected
```

Add `--json` to any command to get a parseable report on stdout:

```bash
php artisan replay:run checkout --mode=protected --json
```

---

## Understanding the report fields

Every run emits a report with two key boolean fields.

### `reproduction_succeeded`

`true` when the two-attempt sequence played out as designed:

- Attempt 1 received a `503` (fault injected after the record was persisted).
- Attempt 2 received a `200` or `201` (the retry completed normally).

When `reproduction_succeeded` is `false`, the scenario did not run as
intended and the result is labelled `INCONCLUSIVE`. This should never happen
in normal usage — it indicates a misconfiguration or an environment problem.

### `operation_safe`

`true` when `reproduction_succeeded` is `true` **and** both attempts returned
the same resource ID.

| `reproduction_succeeded` | `operation_safe` | Meaning |
|--------------------------|------------------|---------|
| `false` | `false` | Replay did not run correctly — inconclusive |
| `true` | `false` | Replay ran correctly — **duplicate created** |
| `true` | `true` | Replay ran correctly — idempotency held ✓ |

### Why the vulnerable scenario exits 1

The `replay:run` command exits `1` whenever `operation_safe` is `false`.
For the vulnerable scenario this is the **expected and intended** outcome —
it proves the problem exists. The exit code is used in CI to fail a build
when a _protected_ scenario unexpectedly degrades to non-idempotent
behaviour.

---

## Adding a new ReplayScenario

1. Create a class in `app/Replay/Scenarios/` that implements
   [`ReplayScenario`](app/Replay/ReplayScenario.php):

   ```php
   class ProtectedPaymentScenario implements ReplayScenario
   {
       public function label(): string
       {
           return 'payment (protected)';
       }

       public function attempt(
           string $runId,
           string $operationId,
           string $attemptId,
           bool $injectFault,
       ): array {
           return $this->dispatch('/api/payments/protected', [
               'operation_id'    => $operationId,
               'idempotency_key' => $this->idempotencyKey,
               'run_id'          => $runId,
               'attempt_id'      => $attemptId,
               'inject_fault'    => $injectFault,
           ], $attemptId);
       }
   }
   ```

2. Register it in the `SCENARIOS` map inside
   [`ReplayRunCommand`](app/Console/Commands/ReplayRunCommand.php):

   ```php
   'payment' => [
       'vulnerable' => VulnerablePaymentScenario::class,
       'protected'  => ProtectedPaymentScenario::class,
   ],
   ```

3. The `ReplayRunner` needs no changes — it calls `attempt()` twice and
   evaluates the evidence automatically.

4. Add a feature test in `tests/Feature/` following the pattern in
   [`ReplayRunCommandTest.php`](tests/Feature/ReplayRunCommandTest.php) or
   [`ReservationScenarioTest.php`](tests/Feature/ReservationScenarioTest.php).

---

## Current limitations

**Instrumented endpoints only.** The replay runner dispatches HTTP requests
in-process using Laravel's kernel. The endpoint must:

- Accept `run_id` and `attempt_id` fields in the request body.
- Write a `replay_attempts` row when those fields are present.
- Honour `inject_fault` to simulate the post-commit `503`.

Endpoints that do not implement this instrumentation will not produce evidence
and the runner will return `INCONCLUSIVE`.

**Simulated post-commit HTTP failure.** The fault injection is implemented
inside the controller by calling `abort(503)` after the database write. This
accurately models the "persisted but not acknowledged" failure mode without
requiring a real network partition or proxy.

**SQLite / in-process only.** The scenarios run inside the same PHP process
as the test suite. They are not suitable for testing connection pooling,
distributed locking, or multi-node concurrency. The tool is a regression
detector, not a load tester.

**Two attempts per run.** The runner always executes exactly two attempts:
one with fault injection and one without. Multi-attempt retry storms are not
modelled.

---

## Automated regression workflow

The repository ships with two GitHub Actions workflows.

### `tests.yml` — standard CI

Runs on every push and pull request:

```bash
composer ci:check   # TypeScript checks, Pint lint, PHPStan, Pest tests
```

### `replay-regression.yml` — recovery replay gate

Also runs on every push and pull request. It:

1. Creates an SQLite database at `/tmp/replay-ci.sqlite`.
2. Runs `php artisan migrate`.
3. Runs the full Laravel test suite (`php artisan test --compact`).
4. Executes the **protected checkout** replay and writes the JSON report.
5. Executes the **protected reservation** replay and writes the JSON report.
6. Verifies `operation_safe = true` in both reports; fails the build if not.
7. Uploads both JSON reports as a `replay-reports` artifact — preserved even
   when the build fails — so developers can inspect the evidence.

The vulnerable scenarios are **not** run as CI gates. Their expected `exit 1`
outcome is already asserted by the feature tests in `ReplayRunCommandTest.php`
and `ReservationScenarioTest.php`.

To reproduce the workflow locally:

```bash
# Replicate what the workflow does (testing env, SQLite, no Node needed):
export APP_ENV=testing
export DB_CONNECTION=sqlite
export DB_DATABASE=/tmp/replay-local.sqlite
touch /tmp/replay-local.sqlite
php artisan migrate --force
php artisan test --compact
php artisan replay:run checkout     --mode=protected --json > /tmp/replay-checkout.json
php artisan replay:run reservation  --mode=protected --json > /tmp/replay-reservation.json
cat /tmp/replay-checkout.json
cat /tmp/replay-reservation.json
```

Both commands must exit `0` and both JSON files must contain
`"operation_safe": true` for the regression check to pass.
