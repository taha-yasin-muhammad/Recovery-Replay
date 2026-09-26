# External adoption spike — Invoice application

Validation spike (not a Recovery Replay product feature). Run on 2026-09-26
against Recovery Replay commit `62642f4` with GitHub Actions green on that
commit (`tests` and `recovery-replay regression`).

The disposable app lived **outside** this repository
(`D:\2026\invoice-replay-spike`). It is not vendored here.

---

## What was done

1. Created a separate minimal Laravel application with an Invoice create operation.
2. Copied unchanged from Recovery Replay (byte-identical hashes confirmed for the core):
    - `ReplayScenario`
    - `ReplayRunner`
    - `PersistedEvidenceEvaluator`
    - `ReplayAttempt`
    - `SimulatedPersistenceFault`
3. Added Invoice model/migration, instrumented controller (local/testing only),
   scenarios, and an adapted `replay:run` command map.
4. Used a disposable SQLite database in the spike app (not the RR database).

`ReplayRunner` and `PersistedEvidenceEvaluator` were **not** modified.

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
| Zero-copy / remote / production adoption                  | **Unverified**                     |
| Demo UI / history / comparison ported                     | **Unverified**                     |
| Real brownfield Invoice complexity                        | **Unverified** (fresh minimal app) |

Integration inconveniences observed (not blockers for the spike):

- `ReplayRunCommand` scenario map is app-specific (copy + edit).
- RR’s split migrations were awkward to copy; spike used one consolidated schema.
- Scenario `dispatch()` helper and evidence writes remain copy-paste.

Elapsed integration effort for the spike: about **5.1 minutes** of scripted setup after prerequisites.

---

## Product stance carried into README

External adoption required copying and instrumentation.
Recovery Replay is **not** a drop-in Composer package today.
