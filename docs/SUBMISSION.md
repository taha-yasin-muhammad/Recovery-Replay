# Hackathon submission readiness

Documentation audit only. No demo video or CI badge was fabricated.
Items marked **MISSING** need human follow-up before submission.

Last audited against the local tree while preparing submission docs
(measurement evidence from commit `62642f4`).

---

## Checklist

| Area | Status | Notes |
| ---- | ------ | ----- |
| README matches current functionality | **Updated** | Workflow, env lock, `/demo`, scenario instrumentation, non-package stance |
| Demo instructions | **Present** | `composer setup`, `composer dev`, open `/demo` and `/demo/history` |
| Measurement document | **Present** | [`docs/MEASUREMENT.md`](MEASUREMENT.md) |
| External adoption evidence summary | **Present** | [`bob_sessions/external-adoption/SUMMARY.md`](../bob_sessions/external-adoption/SUMMARY.md) |
| Measurement CSV / log in repo | **Present** | [`bob_sessions/value-measurement/`](../bob_sessions/value-measurement/) |
| Public GitHub repository | **Present (remote)** | `https://github.com/taha-yasin-muhammad/Recovery-Replay.git` — confirm visibility is public in GitHub settings before submission |
| CI workflows in repo | **Present** | `.github/workflows/tests.yml`, `replay-regression.yml` |
| CI green on HEAD used for experiments | **Verified earlier** | On `62642f4`, both `tests` and `recovery-replay regression` succeeded (checked during Invoice spike). Re-confirm on GitHub Actions before final submit if new commits land |
| Test instructions | **Present** | `composer ci:check`, `php artisan test --compact`, local replay regression steps in README |
| `bob_sessions` evidence folder | **Partial** | Inventory below — video and some spike artifacts still missing |
| Demo video | **MISSING** | No recording in this repository |
| Invoice spike app inside this repo | **Intentionally absent** | Spike lived outside the repo (`D:\2026\invoice-replay-spike`); only the summary is checked in |
| Composer package / Packagist | **Not claimed** | Explicitly unsupported |
| Production / remote network-failure support | **Not claimed** | Explicitly unsupported |

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
- `docs/SUBMISSION.md`
- `bob_sessions/**`
- `.github/workflows/*.yml`

This audit did **not** commit or push.

---

## `bob_sessions` inventory

| Path | Status |
| ---- | ------ |
| `bob_sessions/README.md` | Present (this inventory’s index) |
| `bob_sessions/value-measurement/results.csv` | Present — real measured trials |
| `bob_sessions/value-measurement/log.txt` | Present — real run log |
| `bob_sessions/external-adoption/SUMMARY.md` | Present — Invoice spike findings |
| Demo video (e.g. `bob_sessions/demo/*`) | **MISSING** |
| Full Invoice spike application tree | **Not in this repo** (external disposable app) |
| Screenshots / slide deck | **MISSING** (none found) |

---

## CI and tests

Workflows:

1. **tests** — `composer setup` + `composer ci:check`
2. **recovery-replay regression** — migrate, full Pest suite, protected checkout + reservation JSON gates, artifact upload

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
3. **Re-check Actions** on the commit you actually submit.
4. Optionally link or archive the external Invoice spike if judges need the disposable app (it is not part of this repository).
