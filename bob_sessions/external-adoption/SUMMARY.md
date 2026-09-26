# External adoption spike — Invoice application

Validation spike (not a Recovery Replay product feature). Executed on
2026-09-26 against Recovery Replay commit `62642f4` (GitHub Actions green:
`tests` and `recovery-replay regression` on that commit).

Documentation and product stance in this repository are aligned to commit
**`a985e9c`**, which also passed tests, recovery-replay regression, and
Playwright E2E on GitHub Actions. Between `62642f4` and `a985e9c`,
`ReplayRunner` / `PersistedEvidenceEvaluator` behaviour used by the spike is
unchanged (`ReplayRunner` received comment-only wording).

The disposable app lived **outside** this repository
(`D:\2026\invoice-replay-spike`). It is not vendored here.

Step-by-step integration procedure derived from this spike:
[`docs/EXTERNAL_ADOPTION.md`](../../docs/EXTERNAL_ADOPTION.md).

---

## What was done

1. Created a separate minimal Laravel application with an Invoice create operation.
2. Copied unchanged from Recovery Replay (evaluator and supporting core files
   confirmed byte-identical; runner reused without functional edits):
    - `app/Replay/ReplayScenario.php`
    - `app/Replay/ReplayRunner.php`
    - `app/Replay/PersistedEvidenceEvaluator.php`
    - `app/Models/ReplayAttempt.php`
    - `app/Http/Responses/SimulatedPersistenceFault.php`
3. Adapted / added in the spike app:
    - One consolidated `replay_attempts` migration (not RR’s split pair)
    - Invoice model + migration (`operation_id`, nullable unique
      `idempotency_key`, `status`)
    - Instrumented `InvoiceController` (local/testing only)
    - `VulnerableInvoiceScenario`, `ProtectedInvoiceScenario`,
      `UninstrumentedInvoiceScenario`
    - `ReplayRunCommand` with an `invoice` scenario map
    - `POST /api/invoices` under a local/testing route gate
4. Used a disposable SQLite database in the spike app (not the RR database).

`ReplayRunner` and `PersistedEvidenceEvaluator` were **not** modified for the
domain.

---

## Results

### Vulnerable

- Attempt 1: HTTP **503**, `resource_id` 1
- Attempt 2: HTTP **201**, `resource_id` 2
- `duplicate_resources`: true
- `operation_safe`: false
- Exit code: **1** (expected)

### Missing evidence (uninstrumented path)

- No `ReplayAttempt` rows
- `reproduction_succeeded`: false
- `operation_safe`: false
- Verdict: **INCONCLUSIVE — no evidence recorded for this run**
- Exit code: **1**

### Protected (minimum idempotency on the same Invoice path)

- Attempt 1: HTTP **503**, id 5
- Attempt 2: HTTP **200**, id **5** (same invoice reused)
- `operation_safe`: true
- Exit code: **0**

---

## Integration reality

| Claim                                                     | Supported?                         |
| --------------------------------------------------------- | ---------------------------------- |
| Domain-generic core works on Invoice without core changes | Yes                                |
| Copy + endpoint instrumentation is a viable path          | Yes                                |
| Recovery Replay is a drop-in Composer package             | **No**                             |
| Zero-configuration adoption                               | **No**                             |
| Zero-copy / remote / production adoption                  | **Unverified / unsupported**       |
| Demo UI / history / comparison ported                     | **Unverified**                     |
| Real brownfield Invoice complexity                        | **Unverified** (fresh minimal app) |

Integration inconveniences observed (not blockers for the spike):

- `ReplayRunCommand` scenario map is app-specific (copy + edit).
- RR’s split migrations were awkward to copy; spike used one consolidated schema.
- Scenario `dispatch()` helper and evidence writes remain copy-paste.

Elapsed integration effort for the spike: about **5.1 minutes** of scripted
setup after prerequisites (fresh minimal app — not a brownfield estimate).

---

## Product stance carried into docs

External adoption required copying and instrumentation.
Recovery Replay is **not** a drop-in Composer package today.

See [`docs/EXTERNAL_ADOPTION.md`](../../docs/EXTERNAL_ADOPTION.md) and the root
[`README.md`](../../README.md).
