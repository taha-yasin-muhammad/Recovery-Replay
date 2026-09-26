# bob_sessions evidence

Hackathon evidence collected for Recovery Replay. Only verified artifacts
are stored here. Missing items are listed explicitly.

| Folder                                     | Contents                                        |
| ------------------------------------------ | ----------------------------------------------- |
| [`value-measurement/`](value-measurement/) | Controlled Checkout timing experiment CSV + log |
| [`external-adoption/`](external-adoption/) | Summary of the separate Laravel Invoice spike   |

## Missing (do not invent)

- Demo video recording
- Screenshots / slide deck
- Full Invoice spike application tree (lived outside this repo at
  `D:\2026\invoice-replay-spike` during the experiment)

See also:

- [`docs/EXTERNAL_ADOPTION.md`](../docs/EXTERNAL_ADOPTION.md) — tested copy-and-instrument procedure
- [`docs/MEASUREMENT.md`](../docs/MEASUREMENT.md)
- [`docs/SUBMISSION.md`](../docs/SUBMISSION.md)
- Root [`README.md`](../README.md)


### Evidence Correctness Fix — Fail-Closed Replay Verification

- **Task ID:** `927360cb8501f03914e6fb67a031baa8`
- **Bobcoins consumed:** 3.59
- **Status:** Completed (7/7 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/recovery_replay_evidence_correctness_summary.png)

**Description:** IBM Bob identified and fixed a correctness issue in
ReplayRunner that could incorrectly report an operation as SAFE when
the required persisted evidence was incomplete.

Bob updated the evidence-completeness checks to require valid records
for both the initial attempt and the retry, with matching run and
attempt identities and consistent resource information. Missing,
duplicated, or inconsistent evidence now produces an INCONCLUSIVE
verdict instead of a false SAFE result.

Bob also added regression tests and verified that vulnerable scenarios
still report duplicate resources, while protected scenarios correctly
report resource reuse.

**Validation:** `composer ci:check` and `npm run build` passed.
The task completed with 90 passing tests and 373 assertions.



### Checkout Investigation — Evidence Preservation

- **Task ID:** `baecb7cfdecdfccb4c537cf337ef044e`
- **Bobcoins consumed:** 1.41
- **Status:** Completed (8/8 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/checkout-investigation-evidence-preservation-task.png)

**Description:** IBM Bob verified and preserved the existing Checkout
investigation evidence without rerunning the scenarios. It checked the
original CLI JSON files, exported the relevant persisted evidence from
the investigation database, documented artifact provenance, and added
a Git ignore rule to prevent the SQLite database from being committed.

**Evidence scope:** This screenshot documents the later evidence-
preservation task. It is not a screenshot of the original Bob-led
Checkout investigation.


### Reservation Retry — Domain-Neutral Evidence

- **Task ID:** `31e322d6680a2c412c2d44f91c917a22`
- **Bobcoins consumed:** 3.66
- **Status:** Completed (16/16 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/reservation-retry-generic-evidence-task.png)

**Description:** IBM Bob extended Recovery Replay to support Reservation
retry scenarios while preserving the existing Checkout functionality.

Bob introduced a backward-compatible, domain-neutral evidence model
using `resource_type` and `resource_id`. This allows ReplayRunner to
evaluate orders and reservations without storing reservation IDs in
the legacy `order_id` field.

Bob implemented vulnerable and protected Reservation scenarios,
preserved idempotency safeguards and local/testing restrictions,
and added regression tests for resource identity, persisted evidence,
JSON reports, and CLI exit codes.

**Validation:** The task completed with 22 new Reservation-related
tests and preserved the existing Checkout test behavior.

**Scope:** This screenshot documents the Reservation integration
at that stage of development. The React interface was extended
in subsequent tasks.


### Reusable Scenario Runner and Artisan CLI

- **Task ID:** `d8dd41f2e528a6ceb35d1b6d710d237d`
- **Bobcoins consumed:** 10.35
- **Screenshot:** [Task Session Summary](./screenshots/reusable-scenario-runner-cli-task.png)

**Description:** IBM Bob helped transform Recovery Replay from a
Checkout demonstration into a reusable Laravel retry-testing toolkit.

Bob introduced the ReplayScenario contract and ReplayRunner to
separate scenario-specific behavior from the execution and
evidence-evaluation workflow. It also implemented the replay:run
Artisan command for executing vulnerable and protected Checkout
scenarios and generating machine-readable JSON reports.

The implementation uses the application's actual endpoints and
persisted ReplayAttempt records, generates isolated run identities,
and restricts replay execution to local/testing environments.

**Scope:** This task established the reusable runner and CLI
foundation. Evidence-completeness handling and CLI verdict
correctness were strengthened in subsequent tasks.


### Initial Replay Timeline — Interactive Investigation UI

- **Task ID:** `ef9c27bc1818a6fafbbb51fc728411e9`
- **Bobcoins consumed:** 4.04
- **Screenshot:** [Task Session Summary](./screenshots/initial-replay-timeline-ui-task.png)

**Description:** IBM Bob developed the initial interactive Replay
Timeline using Inertia.js, React, TypeScript, and Tailwind CSS.

The demo executes the existing vulnerable Checkout scenario: the
first request persists an order and returns HTTP 503, then a retry
of the same logical operation creates another order. The interface
retrieves recorded evidence and presents the client's HTTP
responses alongside the server's persisted resources.

Bob also included loading and error states, allowing developers
to investigate the duplicate-order defect through the browser
rather than relying exclusively on terminal output.

**Scope:** This task established the initial vulnerable Checkout
demo. Idempotency protection, the Before/After investigation
workspace, Reservation support, and historical comparisons were
developed in subsequent tasks.


### Initial Checkout — Reproducing an Ambiguous Failure

- **Task ID:** `84966556e15366637dbc0db7e6f14064`
- **Bobcoins consumed:** 1.00
- **Status:** Completed (5/5 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/initial-checkout-failure-scenario.png)

**Description:** IBM Bob implemented the first working backend
scenario for Recovery Replay using Laravel and SQLite.

The scenario demonstrates an ambiguous Checkout outcome: the
server persists an order but returns a simulated HTTP 503.
When the client retries the same logical operation without
idempotency protection, a second order is created.

Bob implemented the minimal Order model and database schema,
a Checkout API endpoint, controlled post-persistence fault
injection, and feature tests using actual database assertions.

**Validation:** 3 tests passed with 13 assertions.

**Scope:** This task established the initial vulnerable Checkout
scenario. Evidence recording, idempotency protection, the
interactive UI, and the reusable ReplayRunner were developed
in subsequent tasks.


### Checkout — Persistent Replay Evidence

- **Task ID:** `920fd79326ff879c0c306dae42f570f1`
- **Bobcoins consumed:** 1.25
- **Status:** Completed (9/9 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/checkout-persistent-evidence-task.png)

**Description:** IBM Bob added persistent evidence recording to the
initial Checkout failure scenario so developers could investigate
what actually happened during each request and retry.

Bob introduced the ReplayAttempt model and database table to record
run IDs, attempt IDs, operation IDs, HTTP statuses, persisted order
IDs, resource counts, and timestamps. It also updated the Checkout
endpoint to record each attempt and added an API endpoint for
retrieving the actual evidence associated with a replay run.

This established the evidence foundation for comparing the client's
HTTP responses with the server's persisted state, without relying
on hardcoded results.

**Scope:** This task added backend evidence recording and retrieval.
Idempotency protection, the interactive Replay Timeline, and the
reusable ReplayRunner were developed in subsequent tasks.


### Protected Checkout — Idempotency Implementation

- **Task ID:** `3b8c6a09ab9d2a7cf38319643d66905a`
- **Bobcoins consumed:** 1.42
- **Status:** Completed (6/6 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/protected-checkout-idempotency-task.png)

**Description:** IBM Bob implemented the initial idempotency-protected
Checkout scenario while preserving the existing vulnerable mode.

The protected implementation uses a database-backed unique
idempotency key. The first request persists an order and returns
a simulated HTTP 503. Retrying with the same key returns the
existing order with HTTP 200 instead of creating a duplicate.

Bob also extended ReplayAttempt evidence recording to capture
both protected attempts and added focused tests for resource
reuse, distinct idempotency keys, HTTP responses, and persisted
order counts.

**Validation:** The task included seven focused tests covering
the vulnerable and protected Checkout behaviors.

**Scope:** This task established the initial protected Checkout
implementation. Additional safeguards for conflicting operation
identities and evidence-completeness verification were strengthened
in subsequent tasks.


### Checkout — Before/After Comparison UI

- **Task ID:** `77393d346e16b568d7a6e2b81c67fe69`
- **Bobcoins consumed:** 1.27
- **Screenshot:** [Task Session Summary](./screenshots/checkout-before-after-comparison-ui-task.png)

**Description:** IBM Bob extended the existing interactive Replay
Timeline to compare vulnerable and idempotency-protected Checkout
behavior side by side.

The interface runs each scenario with separate correlation IDs
and displays the actual HTTP responses and persisted evidence.
The vulnerable scenario demonstrates duplicate order creation,
while the protected scenario demonstrates reuse of the original
order after a simulated HTTP 503.

Bob reused the existing React and Inertia components, preserved
the application's local/testing restrictions, and verified that
the existing backend tests continued to pass.

**Validation:** 18 tests passed with 81 assertions, and the
frontend build completed successfully.

**Scope:** This task established the initial Before/After Checkout
interface. The Investigation Workspace, Reservation presentation,
and historical comparison features were developed in later tasks.


### Replay Reliability Review — Verdicts and Idempotency Safety

- **Task ID:** `09873db58a8a792cdaa1d55e6747d7cc`
- **Bobcoins consumed:** 3.93
- **Status:** Completed (10/10 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/replay-reliability-review-task.png)

**Description:** IBM Bob performed a focused reliability review of
ReplayRunner and the replay:run Artisan command.

The task addressed the distinction between successfully reproducing
a retry defect and verifying that an operation is safe. It also
strengthened reporting and failure handling for unexpected outcomes
and missing evidence.

During the review, Bob identified an idempotency edge case in
ProtectedCheckoutController: an existing order could be returned
when the same idempotency key was reused with a different
operation_id. Bob added operation-identity checks to both the
normal lookup and unique-constraint recovery paths.

A conflicting operation now receives HTTP 409 rather than another
operation's order. Focused regression tests cover this conflict,
legitimate retries, and the absence of unintended database writes.

**Scope:** This screenshot documents the reliability review and
idempotency-key conflict fix. The stricter persisted-evidence
completeness checks were implemented in a subsequent task.


### Bob-Led Checkout Retry Investigation

- **Task ID:** `da767c60c5ecdd43dd7333106888b9fa`
- **Bobcoins consumed:** 2.10
- **Status:** Completed (5/5 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/bob-led-checkout-investigation-task.png)

**Description:** IBM Bob acted as the investigating engineer for a
Checkout retry-related data integrity defect.

Bob inspected the relevant Laravel controllers, replay scenarios,
runner, evidence evaluator, and database schema. It then used an
isolated local/testing database to reproduce the vulnerable Checkout
behavior and investigate the persisted evidence.

The investigation established that the vulnerable retry created a
second order after a simulated post-persistence HTTP 503. Bob also
examined the protected implementation and verified that retrying
with the same idempotency key reused the original order.

Bob distinguished recorded database observations from source-code
inferences and documented the role Recovery Replay played in
reproducing and verifying the defect.

**Evidence provenance:** This screenshot was captured later by
reopening the original task in IBM Bob IDE. It is not a screenshot
taken during the original execution. The subsequent read-only
database evidence extraction is documented separately under
`docs/investigation/`. Original CLI JSON outputs for this
investigation were not preserved.

**Scope:** The investigation used a simulated post-persistence
HTTP 503. It did not test a real network disconnection or
distributed concurrency.


### Investigation Evidence — JSON Encoding and CI Fix

- **Task ID:** `1e210efeefd7c948f14f8fd38489aa7b`
- **Bobcoins consumed:** 1.65
- **Status:** Completed (6/6 tasks)
- **Screenshot:** [Task Session Summary](./screenshots/investigation-json-encoding-ci-fix-task.png)

**Description:** IBM Bob investigated and fixed a GitHub Actions
failure caused by the encoding of preserved Checkout investigation
evidence.

Bob confirmed that the original CLI JSON outputs were encoded as
UTF-16 LE with a byte-order mark, which the project's formatter
could not read. It converted only the repository copies to UTF-8,
applied the project's JSON formatting conventions, and verified
that the parsed evidence content matched the original files.

Bob also updated the investigation provenance documentation to
distinguish the original files from their transcoded repository
copies. No replay scenarios or application logic were changed.

**Validation:** `composer ci:check` passed with 140 tests, and
`git diff --check` reported no whitespace errors.

**Scope:** This task fixed evidence-file compatibility with CI.
It did not reproduce or reinvestigate the Checkout defect.


### Final MVP Acceptance Review

- **Task ID:** `620eb8b1bd1a20b3b83db0baba8d7f98`
- **Bobcoins consumed:** 1.91
- **Screenshot:** [Task Session Summary](./screenshots/final-mvp-acceptance-review-task.png)

**Description:** IBM Bob performed a read-only acceptance review of
Recovery Replay against the six agreed MVP requirements.

Bob inspected the existing implementation, automated tests, CI
workflows, and external adoption evidence. The review covered
post-persistence fault reproduction, evidence-backed safety
verdicts, INCONCLUSIVE handling, saved historical comparisons,
repeatable CLI verification, and the documented Laravel
integration procedure.

The review found no confirmed blockers to the agreed MVP scope.
It distinguished completed requirements from limitations and
optional improvements without expanding the product.

**Scope:** This was an acceptance review, not an implementation
task. No application code, tests, or documentation were changed.
