# External adoption (tested copy-and-instrument path)

Recovery Replay is **not** an installable Composer package. The only
integration path that has been run end-to-end is: copy a small PHP core into
another Laravel application, add a compatible `replay_attempts` schema,
instrument one create-style endpoint, add a scenario, and register
`replay:run`.

That path was validated on a separate minimal Invoice application
(disposable; not vendored in this repository). Evidence summary:
[`bob_sessions/external-adoption/SUMMARY.md`](../bob_sessions/external-adoption/SUMMARY.md).

Baseline for this guide: Recovery Replay commit **`a985e9c`** (tests,
recovery-replay regression, and Playwright E2E green on GitHub Actions).
The Invoice spike itself was executed against an earlier green commit
(`62642f4`); `ReplayRunner` / `PersistedEvidenceEvaluator` behaviour used by
the spike is unchanged through `a985e9c` (comment-only wording on
`ReplayRunner` in between).

---

## What was tested vs what was not

| Claim                                                                                                                    | Status                     |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Domain-generic core works on an Invoice create operation without modifying `ReplayRunner` / `PersistedEvidenceEvaluator` | **Tested** (Invoice spike) |
| Copy + endpoint instrumentation + scenario + CLI map is a viable adoption path                                           | **Tested**                 |
| Fresh minimal Laravel app with a dedicated SQLite database                                                               | **Tested**                 |
| Drop-in Composer / Packagist package                                                                                     | **Not supported**          |
| Zero-configuration adoption                                                                                              | **Not supported**          |
| Brownfield app with real Invoice domain complexity                                                                       | **Unverified**             |
| Remote HTTP / separate process without shared in-process kernel + DB                                                     | **Unverified**             |
| Production or non-`local`/`testing` use                                                                                  | **Unsupported**            |
| Porting `/demo`, run history, or comparison UI                                                                           | **Unverified**             |

Use this document for the smallest **tested** procedure. Do not treat the spike
as proof that arbitrary brownfield or production apps integrate the same way.

---

## Prerequisites (target application)

- Laravel application on PHP 8.3 (spike used a standard Laravel app skeleton).
- `APP_ENV=local` or `APP_ENV=testing` (demo routes and `replay:run` refuse other environments).
- A **dedicated** database for the target app’s local/testing work (spike used its
  own disposable SQLite file — **not** Recovery Replay’s database).
- One create-style business operation you can call twice with the same logical
  `operation_id` (spike: create Invoice).

You do **not** need Recovery Replay’s React UI, Inertia pages, comparison APIs,
or Checkout/Reservation domain models.

---

## File classification

### Copy unchanged (domain-generic core)

Copy these files from Recovery Replay into the same relative paths under the
target app. Keep namespaces `App\…`. Do not edit them for domain specifics.

| Source in this repo                                                                                       | Role                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [`app/Replay/ReplayScenario.php`](../app/Replay/ReplayScenario.php)                                       | Scenario contract                       |
| [`app/Replay/ReplayRunner.php`](../app/Replay/ReplayRunner.php)                                           | Two-attempt runner + fail-closed report |
| [`app/Replay/PersistedEvidenceEvaluator.php`](../app/Replay/PersistedEvidenceEvaluator.php)               | Safety evaluation from persisted rows   |
| [`app/Models/ReplayAttempt.php`](../app/Models/ReplayAttempt.php)                                         | Eloquent model for evidence rows        |
| [`app/Http/Responses/SimulatedPersistenceFault.php`](../app/Http/Responses/SimulatedPersistenceFault.php) | Concise simulated post-persist HTTP 503 |

In the Invoice spike, `ReplayRunner` and `PersistedEvidenceEvaluator` were
**not** modified. Byte-identity was confirmed for the evaluator and supporting
core files; any later comment-only drift on `ReplayRunner` is immaterial.

**Do not copy** for this minimal path: `ComparisonService`, `RunEvidenceSummary`,
Checkout/Reservation controllers or scenarios, demo HTTP comparison routes, or
frontend assets.

### Adapt (app-specific wiring)

| Piece                                                                                       | How the spike adapted it                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replay_attempts` schema                                                                    | One **consolidated** migration (see below). Recovery Replay’s split migrations (`create_replay_attempts_table` + `add_resource_identity_…`) are awkward to copy as-is.                                                                                      |
| [`app/Console/Commands/ReplayRunCommand.php`](../app/Console/Commands/ReplayRunCommand.php) | Copy as a starting point; replace the `SCENARIOS` map and CLI `{scenario}` / `--mode` options with your domain (spike: `invoice` × `vulnerable` \| `protected` \| `uninstrumented`).                                                                        |
| Scenario classes under `app/Replay/Scenarios/`                                              | New classes implementing `ReplayScenario`. Pattern: copy the in-process `dispatch()` helper from [`VulnerableCheckoutScenario`](../app/Replay/Scenarios/VulnerableCheckoutScenario.php), point it at your route, parse your resource id from the JSON body. |
| HTTP route                                                                                  | Register the instrumented endpoint under `local`/`testing` only (spike: `POST /api/invoices` in `routes/api.php`).                                                                                                                                          |
| Artisan discovery                                                                           | Placing the command in `app/Console/Commands/` was enough in the spike’s Laravel skeleton (no extra `console.php` registration). Confirm `php artisan list` shows `replay:run` in **your** app.                                                             |

### Required changes in the target business operation

Instrument the create handler itself (local/testing only). The spike’s
`InvoiceController` is the reference shape; in this repo the same contract
appears on Checkout/Reservation controllers such as
[`CheckoutController`](../app/Http/Controllers/CheckoutController.php) and
[`ProtectedCheckoutController`](../app/Http/Controllers/ProtectedCheckoutController.php).

The handler must:

1. Guard with `abort_unless(app()->environment('local', 'testing'), 403)` (or
   equivalent route-level env gate).
2. Accept request fields: `operation_id` (required), plus `run_id`,
   `attempt_id`, and `inject_fault` for replay; for a protected path also
   `idempotency_key` (or your chosen idempotency mechanism).
3. Persist the business resource **first**.
4. When `run_id` is present, write a `replay_attempts` row **before** returning,
   including at least:
    - `run_id`, `attempt_id`, `operation_id`
    - `resource_type` (e.g. `invoice`), `resource_id` (persisted primary key)
    - `http_status` equal to the status that will be returned
    - `order_count_after` (legacy column name; spike stored the count of
      resources for this `operation_id`)
    - `attempted_at`
    - `order_id` may be `null` for non-order resources
5. When `inject_fault` is true, return `SimulatedPersistenceFault::json()`
   (HTTP **503**) **after** persist + evidence write.
6. Otherwise return success (`201` on create, `200` when an idempotent reuse
   returns the existing resource).

**Vulnerable path:** each attempt creates a new resource when no idempotency
key is supplied → expected duplicate on retry.

**Protected path:** same endpoint (or a protected variant) must reuse the
resource when the same idempotency key is replayed → same `resource_id` on
attempt 2. Minimum spike approach: unique `idempotency_key` column + lookup
before create (see Checkout’s protected controller for the fuller pattern).

**Uninstrumented / missing evidence:** same create + fault injection but
**omit** `run_id` / evidence writes → runner fails closed as `INCONCLUSIVE`.

Without steps 4–5 on an instrumented run, `ReplayRunner` cannot evaluate safety
and returns `INCONCLUSIVE`.

---

## Smallest tested procedure

Work in the **target** application directory (not inside Recovery Replay), with
its own `.env` and database.

### 1. Copy the unchanged core

Copy the five files listed above into matching paths.

### 2. Add a consolidated `replay_attempts` migration

Create a single migration equivalent to the spike schema (columns after both
Recovery Replay migrations have been applied):

```php
Schema::create('replay_attempts', function (Blueprint $table) {
    $table->id();
    $table->string('run_id');
    $table->string('attempt_id')->unique();
    $table->string('operation_id');
    $table->unsignedBigInteger('order_id')->nullable();
    $table->string('resource_type')->nullable();
    $table->unsignedBigInteger('resource_id')->nullable();
    $table->unsignedSmallInteger('http_status');
    $table->unsignedInteger('order_count_after');
    $table->timestamp('attempted_at');
    $table->index('run_id');
});
```

Also ensure your business table exists (spike: `invoices` with `operation_id`,
nullable unique `idempotency_key`, `status`).

```bash
php artisan migrate --force
```

### 3. Instrument the endpoint and register the route

Implement the contract in the previous section. Gate the route to
`local`/`testing`, for example:

```php
if (app()->environment('local', 'testing')) {
    Route::post('/invoices', [InvoiceController::class, 'store']);
}
```

(Mounted under the app’s `api` prefix as `POST /api/invoices` in the spike.)

### 4. Add scenarios

- **Vulnerable:** in-process `POST` with `operation_id`, `run_id`, `attempt_id`,
  `inject_fault` — no idempotency key.
- **Protected:** same URI with a stable `idempotency_key` for both attempts
  (generate once per scenario instance; see
  [`ProtectedCheckoutScenario`](../app/Replay/Scenarios/ProtectedCheckoutScenario.php)).
- **Optional uninstrumented:** same create without `run_id` / `attempt_id` to
  demonstrate fail-closed `INCONCLUSIVE`.

Pattern source: [`VulnerableCheckoutScenario`](../app/Replay/Scenarios/VulnerableCheckoutScenario.php)
(`Illuminate\Contracts\Http\Kernel` dispatch, not remote HTTP).

### 5. Register the CLI map

Adapt `ReplayRunCommand`’s `SCENARIOS` constant so your scenario classes are
reachable, then confirm:

```bash
php artisan list
# expect: replay:run
```

### 6. Run and interpret results

```bash
# Expect unsafe duplicate — exit 1
php artisan replay:run invoice --mode=vulnerable

# Expect same resource on retry — exit 0
php artisan replay:run invoice --mode=protected

# Expect missing evidence — exit 1, INCONCLUSIVE
php artisan replay:run invoice --mode=uninstrumented

# Machine-readable report
php artisan replay:run invoice --mode=protected --json
```

Replace `invoice` with whatever name you registered. Exit code is driven only by
`operation_safe` (`0` when true, `1` when false) — including inconclusive runs.

---

## Expected results and exit codes

| Mode                              | Attempt 1           | Attempt 2           | Distinct `resource_id`s | `reproduction_succeeded` | `operation_safe` | Typical verdict         | Exit  |
| --------------------------------- | ------------------- | ------------------- | ----------------------- | ------------------------ | ---------------- | ----------------------- | ----- |
| Vulnerable                        | `503` after persist | `201` new resource  | 2                       | `true`                   | `false`          | Unsafe / duplicate      | **1** |
| Protected                         | `503` after persist | `200` same resource | 1                       | `true`                   | `true`           | Pass — idempotency held | **0** |
| Uninstrumented / missing evidence | (may still 503/201) | …                   | n/a                     | `false`                  | `false`          | `INCONCLUSIVE — …`      | **1** |

Invoice spike numbers (illustrative of shape, not guaranteed ids):

- Vulnerable: attempt 1 → `503` / id `1`; attempt 2 → `201` / id `2`; exit **1**
- Missing evidence: no `ReplayAttempt` rows; verdict
  `INCONCLUSIVE — no evidence recorded for this run`; exit **1**
- Protected: attempt 1 → `503` / id `5`; attempt 2 → `200` / id `5`; exit **0**

Report fields:

- `reproduction_succeeded` — persisted attempt 1 status is `503` and attempt 2 is
  `200` or `201`, with a complete evidence pair.
- `operation_safe` — reproduction succeeded **and** both attempts share the same
  `resource_id`.

---

## Local/testing, database, and simulated 503 limits

**Environment lock.** Instrumented handlers and `replay:run` are restricted to
`local` and `testing`. Other `APP_ENV` values must fail closed (403 / command
failure). Do not enable this path in production.

**Dedicated database.** Point the target app at its own database. Do not share
Recovery Replay’s SQLite/MySQL file. Evidence rows and business rows live in the
app under test.

**Simulated post-persist HTTP 503.** Controllers honour `inject_fault` **after**
a successful write and return `SimulatedPersistenceFault` JSON. This is **not**:

- a lost or unacknowledged response
- a real network disconnect or partition
- a proxy- or infrastructure-injected fault
- a multi-node or connection-pool failure

Scenarios dispatch through the **in-process** HTTP kernel against the same app
and DB. Remote API replay without that shared process + schema is unverified.

**Two attempts only.** Retry storms are not modelled.

---

## Consistency notes for readers of this repo

- Built-in Recovery Replay scenarios remain `checkout` and `reservation`
  ([`ReplayRunCommand`](../app/Console/Commands/ReplayRunCommand.php)). The
  `invoice` scenario exists only in the external spike.
- This repository does **not** ship the spike application tree; only the summary
  under `bob_sessions/external-adoption/` is checked in.
- For product stance and demo workflow inside this app, see the root
  [`README.md`](../README.md).

---

## Integration steps that cannot yet be documented reliably

These were **not** exercised by the Invoice spike (or are explicitly out of
scope). Do not invent procedure detail for them:

1. Migrating a complex **brownfield** Invoice (or other) domain with existing
   middleware, auth, multi-table writes, queues, or external side effects.
2. Driving replay over **remote HTTP** to another host/process without a shared
   in-process kernel and shared `replay_attempts` database.
3. Any **production** deployment, staging with non-`local`/`testing` env, or
   real network-fault injection.
4. Porting `/demo`, run history, saved comparisons, or frontend assets.
5. Publishing or requiring a Composer package / SDK / middleware abstraction.
6. Exact elapsed effort or checklist timing for a third-party app (spike setup
   was ~5.1 minutes of scripted work on a fresh minimal app after prerequisites —
   not a brownfield estimate).
