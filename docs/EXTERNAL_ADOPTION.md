# External adoption (tested copy-and-instrument path)

Recovery Replay is **not** an installable Composer package. The only
integration path that has been run end-to-end is: copy a small PHP core into
another Laravel application, add a compatible `replay_attempts` schema,
instrument one create-style endpoint, add scenarios, and register
`replay:run`.

That path was validated twice on a separate minimal Invoice application
(disposable; **not** vendored in this repository). Evidence summary:
[`bob_sessions/external-adoption/SUMMARY.md`](../bob_sessions/external-adoption/SUMMARY.md).

Baseline for this guide: Recovery Replay commit **`a985e9c`** (tests,
recovery-replay regression, and Playwright E2E green on GitHub Actions).
`ReplayRunner` / `PersistedEvidenceEvaluator` must remain **byte-identical**
copies — do not edit them for domain specifics.

---

## What was tested vs what was not

| Claim                                                                                                                    | Status                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Domain-generic core works on an Invoice create operation without modifying `ReplayRunner` / `PersistedEvidenceEvaluator` | **Tested** (Invoice apps) |
| Copy + endpoint instrumentation + scenario + CLI map is a viable adoption path                                           | **Tested**                |
| Fresh minimal Laravel app with a dedicated SQLite database                                                               | **Tested**                |
| Drop-in Composer / Packagist package                                                                                     | **Not supported**         |
| Zero-configuration adoption                                                                                              | **Not supported**         |
| Brownfield app with real Invoice domain complexity                                                                       | **Unverified**            |
| Remote HTTP / separate process without shared in-process kernel + DB                                                     | **Unverified**            |
| Production or non-`local`/`testing` use                                                                                  | **Unsupported**           |
| Porting `/demo`, run history, or comparison UI                                                                           | **Unverified**            |

Use this document for the smallest **tested** procedure. Do not treat the
external Invoice apps as proof that arbitrary brownfield or production apps
integrate the same way.

---

## Prerequisites

- PHP **8.3** and Composer.
- A Laravel application (fresh or existing — see step 0).
- `APP_ENV=local` or `APP_ENV=testing` (instrumented routes and `replay:run`
  refuse other environments).
- A **dedicated** database for the target app’s local/testing work (validated
  apps used their own `database/database.sqlite` — **not** Recovery Replay’s
  database).
- One create-style business operation you can call twice with the same logical
  `operation_id` (validated example: create Invoice).

You do **not** need Recovery Replay’s React UI, Inertia pages, comparison APIs,
or Checkout/Reservation domain models.

---

## File classification

### Copy unchanged (exactly these five files)

Copy from Recovery Replay into the **same relative paths** under the target
app. Keep namespaces `App\…`. Do **not** edit them.

| Source in this repo                                                                                       | Role                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`app/Replay/ReplayScenario.php`](../app/Replay/ReplayScenario.php)                                       | Scenario contract                                        |
| [`app/Replay/ReplayRunner.php`](../app/Replay/ReplayRunner.php)                                           | Two-attempt runner + fail-closed report                  |
| [`app/Replay/PersistedEvidenceEvaluator.php`](../app/Replay/PersistedEvidenceEvaluator.php)               | Safety evaluation from persisted rows                    |
| [`app/Models/ReplayAttempt.php`](../app/Models/ReplayAttempt.php)                                         | Eloquent model for evidence rows (`$timestamps = false`) |
| [`app/Http/Responses/SimulatedPersistenceFault.php`](../app/Http/Responses/SimulatedPersistenceFault.php) | Concise simulated post-persist HTTP 503                  |

**Do not copy** for this minimal path: `ComparisonService`, `RunEvidenceSummary`,
Checkout/Reservation controllers or scenarios, demo HTTP comparison routes, or
frontend assets.

### Adapt (target-app wiring — required)

| Piece                                                                                       | What to do                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replay_attempts` schema                                                                    | One **consolidated** migration (step 2). Do not copy Recovery Replay’s split migrations as-is.                                                                                                                                                                                                                                                  |
| Business table + model                                                                      | Minimum Invoice schema/model in the [reference example](#reference-example-validated-invoice-app).                                                                                                                                                                                                                                              |
| Instrumented HTTP handler                                                                   | One create endpoint (validated: single `POST /api/invoices`). Full code in the reference example — **not** shipped as a spike tree in this repo. In-repo contract stand-ins: [`CheckoutController`](../app/Http/Controllers/CheckoutController.php) / [`ProtectedCheckoutController`](../app/Http/Controllers/ProtectedCheckoutController.php). |
| Route + API bootstrap                                                                       | Env-gated route; create `routes/api.php` and register it in `bootstrap/app.php` when absent (step 0 / 3).                                                                                                                                                                                                                                       |
| [`app/Console/Commands/ReplayRunCommand.php`](../app/Console/Commands/ReplayRunCommand.php) | Copy as a **starting point**, then replace the `SCENARIOS` map for your domain (`invoice` × `vulnerable` \| `protected`). Create `app/Console/Commands/` if missing.                                                                                                                                                                            |
| Scenario classes under `app/Replay/Scenarios/`                                              | New classes implementing `ReplayScenario`. Pattern: in-process `dispatch()` from [`VulnerableCheckoutScenario`](../app/Replay/Scenarios/VulnerableCheckoutScenario.php); protected key from [`ProtectedCheckoutScenario`](../app/Replay/Scenarios/ProtectedCheckoutScenario.php). Parse `invoice_id` from the JSON body.                        |

### Optional (test scaffolding only)

An **uninstrumented** scenario (omit `run_id` / `attempt_id`) is **not** a
built-in Recovery Replay feature. This repository’s `replay:run` only ships
`checkout` and `reservation` × `vulnerable` \| `protected`. Any
`--mode=uninstrumented` wiring lives only in the external target app as
optional scaffolding to demonstrate fail-closed `INCONCLUSIVE`.

---

## Smallest tested procedure

Work in the **target** application directory (not inside Recovery Replay), with
its own `.env` and database.

### 0. Obtain a target Laravel app

**Fresh app** (what the validation used):

```bash
composer create-project laravel/laravel invoice-adoption-validation --prefer-dist --no-interaction
cd invoice-adoption-validation
```

Confirm `APP_ENV=local` (or `testing`) and that `DB_CONNECTION` points at **this**
app’s database (default SQLite file `database/database.sqlite` is fine). Do not
point at Recovery Replay’s database.

**Existing Laravel app:** skip `create-project`. Still use a dedicated local /
testing database and `APP_ENV=local` or `testing`. Expect extra brownfield
work (auth, middleware, multi-table writes) — that path is **unverified**.

**Skeleton gaps on a fresh Laravel 11+ / 13 app** (validated on Laravel 13):

1. Create `app/Console/Commands/` if it does not exist — required before
   copying `ReplayRunCommand.php`.
2. Create `routes/api.php` if absent, and register it in `bootstrap/app.php`:

```php
->withRouting(
    web: __DIR__.'/../routes/web.php',
    api: __DIR__.'/../routes/api.php',
    commands: __DIR__.'/../routes/console.php',
    health: '/up',
)
```

Laravel’s `api` registration mounts routes under the `/api` prefix, so
`Route::post('/invoices', …)` becomes `POST /api/invoices`.

### 1. Copy the five unchanged core files

Copy the five files listed under [Copy unchanged](#copy-unchanged-exactly-these-five-files)
into matching paths under the target app. Do not modify them.

### 2. Add migrations and migrate

**`replay_attempts`** (consolidated schema — match the copied `ReplayAttempt`
model; do **not** add Laravel `$table->timestamps()`):

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

**`invoices`** (minimum validated business table):

```php
Schema::create('invoices', function (Blueprint $table) {
    $table->id();
    $table->string('operation_id');
    $table->string('idempotency_key')->nullable()->unique();
    $table->string('status');
    $table->timestamps();
});
```

```bash
php artisan migrate --force
```

### 3. Instrument one endpoint and register the route

**Validated arrangement:** a **single** test-only route,
`POST /api/invoices`, that reuses one business create operation:

| Client behaviour                           | Handler behaviour                                 | Expected on retry after 503 |
| ------------------------------------------ | ------------------------------------------------- | --------------------------- |
| No `idempotency_key`                       | Always create a new invoice                       | **Two** distinct invoices   |
| Same `idempotency_key` on both attempts    | Lookup-or-create; reuse on match                  | **Same** `invoice_id`       |
| Omit `run_id` (optional INCONCLUSIVE test) | Persist invoice; **skip** `replay_attempts` write | Fail-closed `INCONCLUSIVE`  |

Gate the route to `local`/`testing` only, for example in `routes/api.php`:

```php
if (app()->environment('local', 'testing')) {
    Route::post('/invoices', [InvoiceController::class, 'store']);
}
```

Also guard the handler with
`abort_unless(app()->environment('local', 'testing'), 403)`.

Implement the handler using the [reference example](#reference-example-validated-invoice-app)
(or adapt the in-repo Checkout controllers to the same contract).

### 4. Add required scenarios and adapt `replay:run`

#### 4a. Vulnerable scenario — `dispatch()` wiring

Create `app/Replay/Scenarios/VulnerableInvoiceScenario.php` implementing
[`ReplayScenario`](../app/Replay/ReplayScenario.php). Copy the entire
`dispatch()` protected method verbatim from
[`VulnerableCheckoutScenario`](../app/Replay/Scenarios/VulnerableCheckoutScenario.php)
(lines 41–85: the `SymfonyRequest::create` → `Kernel::handle` → `terminate`
block, plus the private `responseBody()` helper).

Two adaptations are required in `attempt()` and `dispatch()`:

1. **URI** — pass `'/api/invoices'` instead of `'/api/checkout'`.
2. **Resource id field** — the Checkout source reads `$body['order_id']`; read
   `$body['invoice_id']` instead. Return `resource_type => 'invoice'` and
   `order_id => null` (the column is legacy and unused for invoices).

`attempt()` sends exactly:

```php
return $this->dispatch('/api/invoices', [
    'operation_id' => $operationId,
    'run_id'       => $runId,
    'attempt_id'   => $attemptId,
    'inject_fault' => $injectFault,
], $attemptId);
```

The `dispatch()` return array must satisfy the `AttemptPayload` shape from
[`ReplayScenario`](../app/Replay/ReplayScenario.php):

```php
return [
    'attempt_id'    => $attemptId,
    'http_status'   => $response->getStatusCode(),
    'resource_type' => 'invoice',
    'resource_id'   => $invoiceId,   // parsed from $body['invoice_id'], or null
    'order_id'      => null,
    'response_body' => $body,
];
```

#### 4b. Protected scenario — same key on both attempts

Create `app/Replay/Scenarios/ProtectedInvoiceScenario.php` extending
`VulnerableInvoiceScenario` (mirrors how
[`ProtectedCheckoutScenario`](../app/Replay/Scenarios/ProtectedCheckoutScenario.php)
extends `VulnerableCheckoutScenario`).

Critical: the `idempotency_key` is generated **once** in `__construct()` and the
**identical value** is sent on both attempt 1 and attempt 2. That shared key is
what lets the handler return the same `invoice_id` on the retry:

```php
class ProtectedInvoiceScenario extends VulnerableInvoiceScenario
{
    private readonly string $idempotencyKey;

    public function __construct()
    {
        $this->idempotencyKey = 'idem-'.Str::random(12);
    }

    public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
    {
        return $this->dispatch('/api/invoices', [
            'operation_id'    => $operationId,
            'idempotency_key' => $this->idempotencyKey,  // same value both calls
            'run_id'          => $runId,
            'attempt_id'      => $attemptId,
            'inject_fault'    => $injectFault,
        ], $attemptId);
    }
}
```

Both `run_id` and `attempt_id` are passed on both attempts so that the handler
writes a `replay_attempts` evidence row each time. `ReplayRunner` supplies a
distinct `$attemptId` per call, so the two rows have unique `attempt_id` values
but share the same `operation_id` and (because of idempotency) the same
`resource_id`.

#### 4c. Copy and adapt `ReplayRunCommand`

**Copy destination:** `app/Console/Commands/ReplayRunCommand.php` in the target
app. Create the `app/Console/Commands/` directory first if it does not exist
(required on fresh Laravel 11+ / 13 skeletons — see step 0).

Copy [`ReplayRunCommand.php`](../app/Console/Commands/ReplayRunCommand.php)
unchanged, then make two edits:

1. **Replace the `SCENARIOS` constant** — remove the `checkout` and
   `reservation` entries and add your invoice classes:

```php
private const array SCENARIOS = [
    'invoice' => [
        'vulnerable' => VulnerableInvoiceScenario::class,
        'protected'  => ProtectedInvoiceScenario::class,
    ],
];
```

2. **Update the `$signature` hint** (optional but avoids misleading help text) —
   change `{scenario : Scenario name (checkout|reservation)}` to
   `{scenario : Scenario name (invoice)}`.

Everything else in the command (`handle()`, env guard, `--mode`, `--json`,
`renderReport()`) is domain-generic and must be kept unchanged. Artisan
auto-discovers commands in `app/Console/Commands/` on the validated skeleton; no
additional registration in `routes/console.php` is needed.

Confirm registration:

```bash
php artisan list
# expect: replay:run
```

### 5. Run the required checks

```bash
# Expect unsafe duplicate — exit 1
php artisan replay:run invoice --mode=vulnerable

# Expect same resource on retry — exit 0
php artisan replay:run invoice --mode=protected

# Machine-readable report
php artisan replay:run invoice --mode=protected --json
```

Replace `invoice` with whatever name you registered. Exit code is driven only by
`operation_safe` (`0` when true, `1` when false) — including inconclusive runs.

### 6. Optional — verify fail-closed INCONCLUSIVE

This step is **optional test scaffolding**. It is **not** part of Recovery
Replay’s built-in CLI surface.

How the runner fails closed: when a run produces **no** `replay_attempts` rows
for its `run_id`, `ReplayRunner` returns
`verdict: INCONCLUSIVE — no evidence recorded for this run`,
`reproduction_succeeded: false`, `operation_safe: false`, exit **1**.

How the validated Invoice app demonstrated that: the same `POST /api/invoices`
handler already skips evidence when `run_id` is absent. An optional scenario
class posted `operation_id` + `inject_fault` only (no `run_id` / `attempt_id`)
and the target app’s adapted `ReplayRunCommand` mapped an optional
`--mode=uninstrumented` to that class. You may instead call the endpoint twice
without `run_id` and inspect that no evidence rows exist — do not treat
`uninstrumented` as a Recovery Replay product feature.

---

## Request and response contract (validated Invoice)

**Request** (`POST /api/invoices`, JSON):

| Field             | Required                  | Role                                                   |
| ----------------- | ------------------------- | ------------------------------------------------------ |
| `operation_id`    | yes                       | Logical operation identity shared across both attempts |
| `run_id`          | for instrumented replay   | When present, handler writes a `replay_attempts` row   |
| `attempt_id`      | recommended with `run_id` | Stable attempt identity for the evidence row           |
| `inject_fault`    | replay attempts           | After persist (+ evidence), return HTTP **503**        |
| `idempotency_key` | protected path only       | When non-empty, lookup-or-create; reuse on retry       |

**Response** (success / reuse):

| HTTP  | Body                                                                               |
| ----- | ---------------------------------------------------------------------------------- |
| `201` | `{"invoice_id": <int>, "status": "<string>"}` — new invoice                        |
| `200` | `{"invoice_id": <int>, "status": "<string>"}` — idempotent reuse                   |
| `503` | `SimulatedPersistenceFault::json()` — after persist (+ evidence when `run_id` set) |
| `409` | Idempotency key bound to a different `operation_id`                                |

Scenarios must read **`invoice_id`** (not `order_id`) when parsing the resource
id from the live response body. Safety evaluation still uses **persisted**
`replay_attempts.resource_id`, not the live body.

**Evidence row** (when `run_id` is present), written **before** the HTTP return:

- `run_id`, `attempt_id`, `operation_id`
- `resource_type` = `invoice`, `resource_id` = invoice primary key
- `http_status` equal to the status that will be returned (`503`, `201`, or `200`)
- `order_count_after` = count of invoices for this `operation_id` (legacy column name)
- `attempted_at` = now
- `order_id` = `null`

**Warning (existing apps):** Validation or business-conflict rules may reject a
retry **before** `ReplayAttempt` instrumentation runs. If only the first attempt
is recorded, Recovery Replay correctly returns `INCONCLUSIVE`. No duplicate
resource does not, by itself, prove successful idempotent reuse or that the
client recovered the original result. Do not assert which function rejected the
retry in FlagHalls — its source was inaccessible during the latest assessment.

---

## Expected results and exit codes

| Mode (target-app)         | Attempt 1           | Attempt 2           | Distinct `resource_id`s | `reproduction_succeeded` | `operation_safe` | Typical verdict         | Exit  |
| ------------------------- | ------------------- | ------------------- | ----------------------- | ------------------------ | ---------------- | ----------------------- | ----- |
| Vulnerable                | `503` after persist | `201` new resource  | 2                       | `true`                   | `false`          | Unsafe / duplicate      | **1** |
| Protected                 | `503` after persist | `200` same resource | 1                       | `true`                   | `true`           | Pass — idempotency held | **0** |
| Optional missing evidence | (may still 503/201) | …                   | n/a                     | `false`                  | `false`          | `INCONCLUSIVE — …`      | **1** |

Illustrative ids from a validation run (shape only; ids are not guaranteed):

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

## Reference example (validated Invoice app)

The disposable validation app is **not** checked into this repository. The
snippets below are the **minimum** shape that completed the second validation.
Prefer adapting these (or the in-repo Checkout controllers) rather than looking
for an `InvoiceController` inside Recovery Replay — it is not shipped here.

### Invoice model

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = [
        'operation_id',
        'idempotency_key',
        'status',
    ];
}
```

### Route (`routes/api.php`)

```php
use App\Http\Controllers\InvoiceController;
use Illuminate\Support\Facades\Route;

if (app()->environment('local', 'testing')) {
    Route::post('/invoices', [InvoiceController::class, 'store']);
}
```

### Instrumented handler (`InvoiceController`)

Validated single-endpoint create (vulnerable when no key; protected when
`idempotency_key` is present). Same business operation for both modes.

```php
namespace App\Http\Controllers;

use App\Http\Responses\SimulatedPersistenceFault;
use App\Models\Invoice;
use App\Models\ReplayAttempt;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class InvoiceController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $request->validate([
            'operation_id' => ['required', 'string'],
            'idempotency_key' => ['nullable', 'string'],
        ]);

        $operationId = $request->input('operation_id');
        $idempotencyKey = $request->input('idempotency_key');

        if (is_string($idempotencyKey) && $idempotencyKey !== '') {
            return $this->storeProtected($request, $operationId, $idempotencyKey);
        }

        $invoice = Invoice::create([
            'operation_id' => $operationId,
            'status' => 'pending',
        ]);

        $injectFault = $request->boolean('inject_fault');
        $httpStatus = $injectFault ? 503 : 201;

        $this->recordEvidence($request, $operationId, $invoice->id, $httpStatus);

        if ($injectFault) {
            return SimulatedPersistenceFault::json();
        }

        return response()->json(['invoice_id' => $invoice->id, 'status' => $invoice->status], 201);
    }

    private function storeProtected(Request $request, string $operationId, string $idempotencyKey): JsonResponse
    {
        $existing = Invoice::where('idempotency_key', $idempotencyKey)->first();

        if ($existing !== null) {
            if ($existing->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            $httpStatus = 200;
            $this->recordEvidence($request, $operationId, $existing->id, $httpStatus);

            return response()->json(['invoice_id' => $existing->id, 'status' => $existing->status], 200);
        }

        try {
            $invoice = Invoice::create([
                'operation_id' => $operationId,
                'idempotency_key' => $idempotencyKey,
                'status' => 'pending',
            ]);
        } catch (UniqueConstraintViolationException) {
            $invoice = Invoice::where('idempotency_key', $idempotencyKey)->firstOrFail();

            if ($invoice->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            $httpStatus = 200;
            $this->recordEvidence($request, $operationId, $invoice->id, $httpStatus);

            return response()->json(['invoice_id' => $invoice->id, 'status' => $invoice->status], 200);
        }

        $injectFault = $request->boolean('inject_fault');
        $httpStatus = $injectFault ? 503 : 201;

        $this->recordEvidence($request, $operationId, $invoice->id, $httpStatus);

        if ($injectFault) {
            return SimulatedPersistenceFault::json();
        }

        return response()->json(['invoice_id' => $invoice->id, 'status' => $invoice->status], 201);
    }

    private function recordEvidence(Request $request, string $operationId, int $invoiceId, int $httpStatus): void
    {
        if (! $request->filled('run_id')) {
            return;
        }

        $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

        ReplayAttempt::create([
            'run_id' => $request->input('run_id'),
            'attempt_id' => $attemptId,
            'operation_id' => $operationId,
            'order_id' => null,
            'resource_type' => 'invoice',
            'resource_id' => $invoiceId,
            'http_status' => $httpStatus,
            'order_count_after' => Invoice::where('operation_id', $operationId)->count(),
            'attempted_at' => now(),
        ]);
    }
}
```

### Scenario payloads (in-process POST `/api/invoices`)

```php
// Vulnerable (required)
[
    'operation_id' => $operationId,
    'run_id' => $runId,
    'attempt_id' => $attemptId,
    'inject_fault' => $injectFault,
]

// Protected (required) — same idempotency_key for both attempts
[
    'operation_id' => $operationId,
    'idempotency_key' => $this->idempotencyKey,
    'run_id' => $runId,
    'attempt_id' => $attemptId,
    'inject_fault' => $injectFault,
]

// Optional INCONCLUSIVE scaffolding — omit run_id / attempt_id
[
    'operation_id' => $operationId,
    'inject_fault' => $injectFault,
]
```

Parse `invoice_id` from the response body when building the scenario’s return
array; set `resource_type` to `invoice` and `order_id` to `null`.

### Target-app `SCENARIOS` map (adapted command)

```php
private const array SCENARIOS = [
    'invoice' => [
        'vulnerable' => VulnerableInvoiceScenario::class,
        'protected' => ProtectedInvoiceScenario::class,
        // Optional only — not a Recovery Replay built-in mode:
        // 'uninstrumented' => UninstrumentedInvoiceScenario::class,
    ],
];
```

---

## Consistency notes for readers of this repo

- Built-in Recovery Replay scenarios remain `checkout` and `reservation`
  ([`ReplayRunCommand`](../app/Console/Commands/ReplayRunCommand.php)).
- This repository does **not** ship the disposable Invoice application tree;
  only the summary under `bob_sessions/external-adoption/` is checked in.
- For product stance and demo workflow inside this app, see the root
  [`README.md`](../README.md).

---

## Integration steps that cannot yet be documented reliably

These were **not** exercised by the Invoice validations (or are explicitly out
of scope). Do not invent procedure detail for them:

1. Migrating a complex **brownfield** Invoice (or other) domain with existing
   middleware, auth, multi-table writes, queues, or external side effects.
2. Driving replay over **remote HTTP** to another host/process without a shared
   in-process kernel and shared `replay_attempts` database.
3. Any **production** deployment, staging with non-`local`/`testing` env, or
   real network-fault injection.
4. Porting `/demo`, run history, saved comparisons, or frontend assets.
5. Publishing or requiring a Composer package / SDK / middleware abstraction.
6. Exact elapsed effort or checklist timing for a third-party app.
