# Checkout Investigation — Evidence Provenance

This directory preserves evidence from two separate investigation activities.
**Do not substitute artifacts from one activity for another.**

---

## 1. Earlier CLI Runs (`earlier-cli-runs/`)

These files were produced by running the replay CLI tool **before** the
Bob-led investigation session. The originals were written to `D:\2026\` by
the CLI process in **UTF-16 LE with BOM** encoding.

The repository copies contain **identical JSON content** but have been
transcoded from UTF-16 LE (BOM) to **UTF-8 without BOM** so that standard
tooling (formatters, linters, CI checks) can read them. No JSON values,
keys, run IDs, attempt IDs, resource IDs, HTTP statuses, verdicts, or any
other evidence fields were changed during transcoding.

| File                           | Run ID                                 | Scenario              | Verdict                                                                    |
| ------------------------------ | -------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `rr-vulnerable--b1ee39b6.json` | `b1ee39b6-9c03-43cb-940f-d78fa6171818` | checkout (vulnerable) | EXPECTED FAILURE — duplicate resources created (no idempotency protection) |
| `rr-protected--f968778a.json`  | `f968778a-6333-4f02-8624-2ac3c8d1932f` | checkout (protected)  | PASS — retry returned the same resource (idempotency held)                 |

**Source:** Original CLI output files at `D:\2026\rr-vulnerable.json` and
`D:\2026\rr-protected.json` (UTF-16 LE with BOM, byte-identical to what the
CLI wrote). Repository copies transcoded to UTF-8 without BOM; JSON content
is unchanged and verified to match the originals by round-trip parse
comparison.

**Exit-code note:** The original terminal exit codes for these CLI runs are
**not recorded here**. Do not infer them from any other experiment's output.

---

## 2. Bob-Led Investigation (`bob-led-investigation/`)

These files contain a **read-only extraction** from `storage/investigation.sqlite`,
performed after the Bob-led investigation session was complete.

| File                                  | Run IDs covered                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `db-extract--cbfa7a1c--cd760b55.json` | `cbfa7a1c-3e01-4a5d-9784-27c7edbcec7d` (vulnerable) · `cd760b55-67c7-4b3d-ae69-730de936cc0e` (protected) |

**Important limitations:**

- This is **not** the original terminal output from the investigation session.
  The original session output (screenshots, live console text) was not captured
  and is **MISSING** — see section 4 below.
- The SQLite database is **not** an unchanged snapshot from the time of the
  investigation. It reflects the database state at extraction time
  (2026-09-26T18:29:20Z). Its filesystem mtime was 2026-09-26T18:48:32Z.
- Only the allowlisted fields from `replay_attempts` and `orders` rows matching
  the two verified run IDs were exported. No other tables or rows were exported.

**Extraction query scope:**

- `replay_attempts` — all columns, filtered to the two run IDs above.
- `orders` — all columns, filtered to `operation_id` values that appear in
  those replay attempt rows.

---

## 3. Value-Measurement Experiment

A separate value-measurement experiment exists in this repository
(see `tests/Feature/CheckoutScenarioTest.php` and related test fixtures).
That experiment is **distinct** from both the earlier CLI runs and the
Bob-led investigation. Its run IDs, exit codes, and results must not be
mixed with the evidence in this directory.

---

## 4. Missing Artifacts

The following original artifacts were **not captured** and cannot be
reconstructed:

| Artifact                                                                               | Status           |
| -------------------------------------------------------------------------------------- | ---------------- |
| Original Bob session screenshots (investigation)                                       | **MISSING**      |
| Original investigation CLI JSON files (if any were written separately from `D:\2026\`) | **MISSING**      |
| Terminal exit codes for earlier CLI runs `b1ee39b6` and `f968778a`                     | **NOT RECORDED** |

Do not substitute any preserved artifact for a missing one.

---

## 5. What Is Not Here

- `storage/investigation.sqlite` — excluded from version control via
  `.gitignore` (see root `.gitignore`). It must not be staged or committed.
- Any PHP or React application code changes — none were made during evidence
  preservation.
- Any database writes, migrations, or replay commands — none were executed
  during evidence preservation.
