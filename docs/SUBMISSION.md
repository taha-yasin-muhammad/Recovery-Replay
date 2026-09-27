# Hackathon submission readiness

Documentation audit only. No demo video or CI badge was fabricated.
Items marked **MISSING** need human follow-up before submission.

Evidence and CI notes below are tied to specific commits. Do not treat a
local check as GitHub Actions success for an unpushed tree.

- Measurement evidence and Invoice spike runs: recorded against `62642f4`.
- Earlier fully green documentation baseline: **`a985e9c`** (tests,
  recovery-replay regression, Playwright E2E all green).
- Current audited HEAD at last remote push: **`5014066`** — see CI section.

---

## Checklist

| Area                                        | Status                   | Notes                                                                                                                            |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| README matches current functionality        | **Updated**              | Workflow, env lock, `/demo`, scenario instrumentation, non-package stance                                                        |
| Demo instructions                           | **Present**              | `composer setup`, `composer dev`, open `/demo` and `/demo/history`                                                               |
| Measurement document                        | **Present**              | [`docs/MEASUREMENT.md`](MEASUREMENT.md)                                                                                          |
| External adoption procedure                 | **Present**              | [`docs/EXTERNAL_ADOPTION.md`](EXTERNAL_ADOPTION.md) — tested copy-and-instrument path from Invoice spike                         |
| External adoption evidence summary          | **Present**              | [`bob_sessions/external-adoption/SUMMARY.md`](../bob_sessions/external-adoption/SUMMARY.md)                                      |
| Measurement CSV / log in repo               | **Present**              | [`bob_sessions/value-measurement/`](../bob_sessions/value-measurement/)                                                          |
| Public GitHub repository                    | **Present (remote)**     | `https://github.com/taha-yasin-muhammad/Recovery-Replay.git` — confirm visibility is public in GitHub settings before submission |
| CI workflows in repo                        | **Present**              | `.github/workflows/tests.yml`, `replay-regression.yml`, `e2e.yml`                                                                |
| CI on earlier green baseline `a985e9c`      | **Verified**             | Tests, recovery-replay regression, and Playwright E2E green. Invoice spike itself ran on earlier green `62642f4`                 |
| CI on audited HEAD `5014066`                | **Partial**              | Regression + Playwright E2E green; **tests** failed at `composer ci:check` (markdown formatting in `bob_sessions/README.md`)     |
| Test instructions                           | **Present**              | `composer ci:check`, `php artisan test --compact`, local replay regression steps in README                                       |
| `bob_sessions` evidence folder              | **Partial**              | Inventory below — task screenshots present; demo video and spike app tree still missing                                          |
| Demo video                                  | **MISSING**              | No recording in this repository                                                                                                  |
| Invoice spike app inside this repo          | **Intentionally absent** | Spike lived outside the repo (`D:\2026\invoice-replay-spike`); only the summary is checked in                                    |
| Composer package / Packagist                | **Not claimed**          | Explicitly unsupported                                                                                                           |
| Production / remote network-failure support | **Not claimed**          | Explicitly unsupported                                                                                                           |

---

## Demo instructions (quick)

```bash
composer setup
composer dev
# Browser: http://localhost:8000/demo
# CLI:     php artisan replay:run checkout --mode=protected --json
# Tests:   php artisan test --compact
```

Environment must be `local` or `testing`.

---

## Public repository contents to double-check before submit

Confirm these are **not** published if you intend a clean public tree:

- `.env` (gitignored — verify it never appears on GitHub)
- Local SQLite databases under `database/`
- `node_modules/`, `vendor/`
- Agent / Boost tooling files already gitignored (`AGENTS.md`, `.cursor`, etc.)

Confirm these **are** present on the default branch after you commit docs:

- `README.md`
- `docs/MEASUREMENT.md`
- `docs/EXTERNAL_ADOPTION.md`
- `docs/SUBMISSION.md`
- `bob_sessions/**`
- `.github/workflows/*.yml`

This audit did **not** commit or push.

---

## `bob_sessions` inventory

| Path                                         | Status                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bob_sessions/README.md`                     | Present (this inventory’s index)                                                             |
| `bob_sessions/value-measurement/results.csv` | Present — real measured trials                                                               |
| `bob_sessions/value-measurement/log.txt`     | Present — real run log                                                                       |
| `bob_sessions/external-adoption/SUMMARY.md`  | Present — Invoice spike findings                                                             |
| `bob_sessions/screenshots/*.png`             | Present — 13 task session screenshots (see `bob_sessions/README.md` for per-task provenance) |
| Demo video (e.g. `bob_sessions/demo/*`)      | **MISSING**                                                                                  |
| Slide deck                                   | **MISSING**                                                                                  |
| Full Invoice spike application tree          | **Not in this repo** (external disposable app)                                               |
| Bob-led investigation original CLI JSON      | **MISSING** — not preserved; do not substitute `docs/investigation/earlier-cli-runs/`        |

Screenshot provenance: a screenshot captured later by reopening an original
Bob task is valid evidence of that task, but it was not taken during the
original execution. Where that applies, `bob_sessions/README.md` states it.
The later read-only DB extract under `docs/investigation/bob-led-investigation/`
is not original terminal output and is not an unchanged DB snapshot.

---

## CI and tests

Workflows:

1. **tests** — `composer setup` + `composer ci:check`
2. **recovery-replay regression** — migrate, full Pest suite, protected checkout + reservation JSON gates, artifact upload
3. **e2e** — Playwright E2E

### Remote GitHub Actions (by commit)

| Commit    | tests                                                                  | recovery-replay regression | e2e (Playwright) |
| --------- | ---------------------------------------------------------------------- | -------------------------- | ---------------- |
| `a985e9c` | green                                                                  | green                      | green            |
| `5014066` | **failed** (`composer ci:check` — `bob_sessions/README.md` formatting) | green                      | green            |

`5014066` run links:

- tests (failure): https://github.com/taha-yasin-muhammad/Recovery-Replay/actions/runs/36272206030
- recovery-replay regression (success): https://github.com/taha-yasin-muhammad/Recovery-Replay/actions/runs/36272206119
- e2e (success): https://github.com/taha-yasin-muhammad/Recovery-Replay/actions/runs/36272206042

Documentation/formatting corrections after `5014066` are local until pushed.
GitHub Actions has **not** yet tested any newer commit than `5014066`.

Local validation after these documentation/formatting corrections (unpushed
working tree): `composer ci:check` passed (140 tests, 594 assertions);
`git diff --check` reported no whitespace errors. That is not a remote
Actions result.

Local commands:

```bash
composer ci:check
php artisan test --compact
php artisan replay:run checkout --mode=protected --json
php artisan replay:run reservation --mode=protected --json
```

---

## Still needed before calling submission “complete”

1. **Record and attach a demo video** (CLI and/or `/demo` walkthrough).
2. **Confirm the GitHub repo is public** and that documentation commits are on the default branch.
3. **Push documentation/formatting fixes** and **re-check Actions** on the commit you actually submit (do not claim remote green from local checks alone).
4. Optionally link or archive the external Invoice spike if judges need the disposable app (it is not part of this repository).
