# Controlled value measurement

Honest, reproducible record of the Recovery Replay vs manual investigation
experiment. Numbers below are from the measured trials only. Do not treat
this as a human user study or a claim about production productivity.

- Commit under test: `62642f4`
- Date: 2026-09-26
- Operation: Checkout (vulnerable and protected)
- Raw CSV / log: [`bob_sessions/value-measurement/`](../bob_sessions/value-measurement/)

---

## Question

Does Recovery Replay reduce the work needed to answer, for one instrumented
operation:

- HTTP status of attempt 1 and the retry?
- Persisted resource ID(s)?
- Duplicate created?
- Operation safe?
- What evidence supports that conclusion?

---

## Methods compared

|           | A. Manual                                              | B. Tool (`replay:run`)                                                |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Procedure | Two HTTP POSTs via `curl` + Eloquent query of `orders` | `php artisan replay:run checkout --mode=… --json`                     |
| Verdict   | Derived by investigator from statuses + order IDs      | Taken from generated JSON (`operation_safe`, `verdict`, attempt rows) |
| Not used  | CLI replay, `/demo` UI, Run History                    | Manual re-inference of safety after reading JSON                      |

Shared conditions:

- Same machine
- Disposable SQLite DB outside the repo (`D:\2026\rr-value-measure.sqlite` during the run)
- Same Checkout endpoints
- Existing `inject_fault` instrumentation (pre-existing; not rebuilt for the experiment)
- Fresh operation IDs each trial; tables cleared between trials
- Method order alternated across trials (M→T / T→M)

### Action rubric (fixed)

| Method | Count | Actions                                                                                                     |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------- |
| Manual | 6     | send attempt 1 · record status · send retry · record status · query persisted IDs · conclude safe/duplicate |
| Tool   | 2     | run `replay:run` · read generated report fields / verdict                                                   |

---

## Protocol

1. Create disposable SQLite + migrate (setup; **excluded** from investigation timers).
2. Serve the app on `:8010` against that DB (started once; **excluded**).
3. Pilot one vulnerable manual + one vulnerable tool trial (procedure check; **not** in averages).
4. Run three measured trials per method × mode (vulnerable and protected).
5. For each trial, wall-clock investigation time with a stopwatch from first investigative action to conclusion.
6. Record statuses, resource IDs, duplicate flag, safe flag, ms, actions, correctness, evidence pointer.
7. Vulnerable tool exit code `1` is the expected unsafe outcome (counts as correct when JSON shows duplicate / unsafe).

### Setup effort (excluded from investigation averages)

| Step                                            | Measured                           |
| ----------------------------------------------- | ---------------------------------- |
| Create disposable SQLite + `migrate`            | 1520 ms                            |
| Health check `GET /up`                          | 265 ms                             |
| App instrumentation (`inject_fault`, endpoints) | Pre-existing — shared prerequisite |

---

## Results

### Pilot (not in averages)

| Method | Mode       | Status 1/2 | Resource IDs | Dup | Safe | ms   | Actions | Correct      |
| ------ | ---------- | ---------- | ------------ | --- | ---- | ---- | ------- | ------------ |
| Manual | vulnerable | 503 / 201  | 3, 4         | yes | no   | 1056 | 6       | yes          |
| Tool   | vulnerable | 503 / 201  | 5, 6         | yes | no   | 550  | 2       | yes (exit 1) |

### Measured trials (n = 3 per method × mode)

| Trial | Order | Method | Mode       | HTTP 1→2 | Resource IDs | Dup | Safe | ms   | Actions | Correct |
| ----- | ----- | ------ | ---------- | -------- | ------------ | --- | ---- | ---- | ------- | ------- |
| V1    | M→T   | Manual | vulnerable | 503→201  | 7, 8         | yes | no   | 999  | 6       | yes     |
| V1    | M→T   | Tool   | vulnerable | 503→201  | 9, 10        | yes | no   | 693  | 2       | yes     |
| V2    | T→M   | Tool   | vulnerable | 503→201  | 11, 12       | yes | no   | 536  | 2       | yes     |
| V2    | T→M   | Manual | vulnerable | 503→201  | 13, 14       | yes | no   | 1072 | 6       | yes     |
| V3    | M→T   | Manual | vulnerable | 503→201  | 15, 16       | yes | no   | 1022 | 6       | yes     |
| V3    | M→T   | Tool   | vulnerable | 503→201  | 17, 18       | yes | no   | 529  | 2       | yes     |
| P1    | T→M   | Tool   | protected  | 503→200  | 19           | no  | yes  | 579  | 2       | yes     |
| P1    | T→M   | Manual | protected  | 503→200  | 20           | no  | yes  | 1013 | 6       | yes     |
| P2    | M→T   | Manual | protected  | 503→200  | 21           | no  | yes  | 999  | 6       | yes     |
| P2    | M→T   | Tool   | protected  | 503→200  | 22           | no  | yes  | 557  | 2       | yes     |
| P3    | T→M   | Tool   | protected  | 503→200  | 23           | no  | yes  | 525  | 2       | yes     |
| P3    | T→M   | Manual | protected  | 503→200  | 24           | no  | yes  | 1004 | 6       | yes     |

All **12** measured conclusions were correct. Expected 503→2xx sequence and IDs were present in every trial.

### Aggregates (measured only)

| Method | Mode       | Investigation ms (3 trials) | Average  | Median | Actions |
| ------ | ---------- | --------------------------- | -------- | ------ | ------- |
| Manual | vulnerable | 999 / 1072 / 1022           | **1031** | 1022   | 6       |
| Tool   | vulnerable | 693 / 536 / 529             | **586**  | 536    | 2       |
| Manual | protected  | 1013 / 999 / 1004           | **1005** | 1004   | 6       |
| Tool   | protected  | 579 / 557 / 525             | **554**  | 557    | 2       |

Under this scripted procedure, tool wall-clock was about **0.55×** manual
(~1.8× faster) with **2 vs 6** prescribed actions.

---

## Important caveats on timing

Manual trials used **HTTP requests** (`curl` to a running server).
Tool trials used Laravel **in-process** kernel execution via `replay:run`.

Do **not** attribute all timing differences to developer productivity.
Transport and process model differ. The supported claim is narrower: for this
instrumented Checkout protocol, the CLI reduced prescribed actions and
investigation wall-clock while matching correctness.

---

## Limitations

- Scripted experiment, not a human exploratory user study.
- Application instrumentation was pre-existing.
- Relies on `inject_fault` — not a real network partition.
- Does not measure other developers, brownfield apps, or distributed concurrency.
- Manual 503 response body has no `order_id`; finding attempt-1’s resource required a DB query (counted in the rubric).

---

## Supported claim

For an instrumented local/testing Checkout replay, `replay:run --json`
shortens the path from “run two attempts” to “statuses, IDs, duplicate?,
safe?” versus curl + DB, with matching correctness on vulnerable (duplicate)
and protected (reuse) modes in this protocol.

It does **not** by itself prove value for uninstrumented production systems,
real disconnects, or other developers’ workflows.

---

## How to reproduce the shape of this experiment

1. Check out commit `62642f4` (or later with equivalent Checkout instrumentation).
2. Point a disposable SQLite database at a path outside the repo; migrate.
3. Serve with `APP_ENV=local` against that DB.
4. Manual: two POSTs to `/api/checkout` or `/api/checkout/protected` with
   `inject_fault` true then false; query `orders` by `operation_id`.
5. Tool: `php artisan replay:run checkout --mode=vulnerable|protected --json`.
6. Clear tables between trials; alternate method order; use the action rubric above.
7. Compare wall-clock and correctness — do not invent trials that were not run.

Raw artifacts checked into this repo:

- [`bob_sessions/value-measurement/results.csv`](../bob_sessions/value-measurement/results.csv)
- [`bob_sessions/value-measurement/log.txt`](../bob_sessions/value-measurement/log.txt)
