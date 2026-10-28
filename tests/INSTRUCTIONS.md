<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Test Instructions

This project runs tests in containers for reproducibility.

## Prerequisites
- Docker daemon running locally

## Unit Tests (PHPUnit)
- Run full suite:
  - `./tests/run-unit.sh`

Notes:
- Default container image: `php-with-phpunit:latest`
- Override image if needed:
  - `PHPUNIT_IMAGE=my-image:tag ./tests/run-unit.sh`

GitHub Actions runs this same PHPUnit configuration and the browser wrapper on pull requests and pushes to `main`. These checks use fixtures; live Nextcloud checks remain separate.

## UI Tests (Playwright)
- Run the modal/form, dashboard, unit-workspace, and process-detail behavioral regression suites: `./tests/run-playwright.sh`.
- Run only renter access fixtures with `PLAYWRIGHT_TEST=renter-access ./tests/run-playwright.sh`.
  These cover partner account linking, standard Guests creation, lost-response retries,
  account status, Personal visibility and narrow layout. They do not prove live email delivery.
- The wrapper builds `domus-playwright:local` when missing. Override with
  `PLAYWRIGHT_IMAGE` to use an existing compatible Playwright image.
- Tests load the actual JavaScript modules and CSS in Chromium, with fixture API
  responses. They do not require a Nextcloud login or write server records.
- The Team context fixture checks Personal and multiple Team choices after navigation refresh.
  stale preview responses, and the management boundary for accounts without portfolio access.
- Booking/document regressions in `modal-changes` cover partial-save retries, nested
  document editing without competing booking drafts, file-source switching/reset,
  property-scoped allocation defaults, disclosure state, and keyboard file picking.
- Coverage includes changed/unchanged forms, dismissal paths, successful/failed
  saves, asynchronous defaults, document selections, nested dialogs, keyboard
  focus, dashboard due-date groups and creation shortcuts, unit section
  navigation, contextual actions, role safeguards, process completion and reopening,
  inline step descriptions, optional actions, cancellation, reload recovery, and narrow viewports. Renter preview coverage includes simulated selection, related tenancies, read-only documents, empty and failed loads, stale responses, and landlord controls. Live
  Nextcloud checks remain separate.

- Run the dedicated renter UI with `PLAYWRIGHT_TEST=renter-portal ./tests/run-playwright.sh`.
  This checks account-derived navigation, multiple Teams, contact correction submission,
  management context switches, revoked access, stale responses, and shared Activity lists/dialogs for correction decisions on renter and partner details. Backend portal tests
  cover field filtering, direct document delivery authorization and correction decisions.
  Browser fixtures do not prove live storage permissions or guest app allowlists.

The unit-workspace suite also checks year-closing account totals, advisory errors,
confirmation, reopening, load retries, stale responses, failed saves, and phone layout.

Run `PLAYWRIGHT_TEST=dialog-template ./tests/run-playwright.sh` for shared headers and persistent footers, native form validation and Enter submission, discard confirmations, focus restoration, and welcome navigation/completion at desktop and phone widths. Nextcloud file pickers retain their own dialogs.

## Welcome wizard screenshots
- Run `./tests/capture-wizard-screenshots.sh` with the local NC35 stack running.
- The script reads the local NC35 admin login from `nc35-app-1` and captures the
  current demo apartment, finance, tenancy, and dashboard views into
  `img/pictures/`. Set `DOMUS_USER` and `DOMUS_PASSWORD` to use another account,
  or `DOMUS_BASE_URL` to target another reachable instance.
- Keep the demo apartment picture available. The script fails if it cannot load
  the real Nextcloud preview instead of silently capturing the fallback icon.
- The finance crop uses the desktop layout and keeps the left two thirds of the yearly results table.
  The dashboard crop shows the full panel row and KPI tiles; other task groups
  are hidden only while that screenshot is taken.
- Set `DOMUS_PREVIEW_DIR=/work/tests/ui-artifacts` to save full wizard previews
  for visual review. This also checks that the two screenshots display at least
  300 pixels wide in the original wizard layout.

## License Compliance (REUSE)
- Run REUSE lint:
  - `./tests/run-reuse.sh`

Analytics coverage includes latest-year defaults, direct parent/child booking totals,
property/unit scope, year and custom selection continuity, keyboard checkboxes,
narrow layout, empty scopes, retry, and obsolete request failures.

Maintainability regression coverage includes shared financial calculations and
calendar proration, strict financial input validation, tenancy classification,
batched enrichment, distribution/report agreement, and the API error contract.
Run `PLAYWRIGHT_TEST=view-lifecycle ./tests/run-playwright.sh` for delayed
success/failure responses, repeated rendering, and chart disposal, or
`PLAYWRIGHT_TEST=ui-reuse ./tests/run-playwright.sh` for reusable KPI types and
property/unit image editors. These suites also run in the full browser wrapper.

Run `PLAYWRIGHT_TEST=rules ./tests/run-playwright.sh` for ruleset editing and
preview, task reminder choices, deferred task visibility, reference-date entry,
retry, and phone layout. Process-detail tests cover the same reminder dialog for open
process steps. Reminder tests verify rescheduled deadlines, normal-list visibility of deferred tasks,
expiry, and process access boundaries. Task lifecycle tests cover expiry rechecks, rent changes,
completion/deletion, rule disabling, invalid dates, and unauthorized reminders. The PHP rule tests cover calendar thresholds,
unknown history, ownership boundaries, scope selection, duplicate-task prevention,
snooze expiry, resolution, and background ownership-context restoration.

Run `PLAYWRIGHT_TEST=routing ./tests/run-playwright.sh` for path-based deep links,
reload initialization, browser Back/Forward, encoded route
arguments, subdirectory installations, and renter navigation restrictions.

Portfolio performance coverage in `PLAYWRIGHT_TEST=analytics ./tests/run-playwright.sh`
includes the four summary metrics, cumulative acquisition costs, all-year trends and tables, scope filters, missing
acquisition costs, provisional years, phone layout, retry, and obsolete responses.
`PortfolioPerformanceTest` verifies shared finance formulas, weighted profitability,
annual rent proration, annual rent totals, continuous years, acquisition cost accumulation by purchase year with history/current-year fallbacks, and exclusion of out-of-scope units.

Run `PLAYWRIGHT_TEST=document-templates ./tests/run-playwright.sh` for utility-template assignment,
document/process/scope rows, keyboard add and per-row removal, failed saves, readable HTTP errors,
DOCX generation selection, missing/error states, explicit Markdown fallback, and narrow dialogs.
The PHP template tests cover split Word text runs, XML escaping, unknown variables, missing IBANs,
header/footer replacement, package preservation, actor file access and Personal/Team assignments.
These fixtures do not prove office-editor rendering or permissions for a second real Team user.

Run `PLAYWRIGHT_TEST=tax-report ./tests/run-playwright.sh` for the Tax declaration settings entry,
Wiso hierarchy and row order, fixed headers and row labels while scrolling, itemized booking texts and signed amounts, year-closing status,
year selection, retry, empty state, and phone layout.
The tax-report PHP tests cover Wiso amounts and control balance, separate tenant credits/payments, child accounts,
unit/property year closure, year-scoped booking descriptions, and exclusion of foreign units. Rent and prepayments use existing
tenancy proration; expense amounts use unit bookings.

Automatic booking assignment preview checks:
- Run `./tests/run-unit.sh --filter "BookingAssignment|AiDocumentValidation"` for strict JSON/evidence validation,
  missing/ambiguous periods, explicit zero, rejection of building totals as supported individual evidence, optional Assistant,
  scans, provider availability, inaccessible files and actor/unit/scope task binding.
- Run `PLAYWRIGHT_TEST=modal-changes ./tests/run-playwright.sh` for PDF uploads and
  Nextcloud selection, empty manual fields, retry/errors, preserved drafts, nested focus,
  late task creation cleanup, Team changes, opt-out, initial dropped PDFs and replacement of inferred units.
- Run `PLAYWRIGHT_TEST=renter-preview ./tests/run-playwright.sh` for the renamed
  Nextcloud Integration Check and the AI settings toggle.
- AI document validation is off by default. Enable it in Settings → Nextcloud Integration Check in the active
  Personal/Team context. Assistant, task processing and a text provider must be available.
  Selecting a PDF opens the preview automatically; there is no manual Test button.
  Building Management forms are excluded because their account model differs.
- Live model acceptance is separate: test the Hartmutstraße annual statement (2025,
  2000 = 1939.39, 2100 = 579.48, 2200 missing), mixed actual/plan pages and columns,
  and individual Ist-Zuführung versus Soll/balances/withdrawals/interest. Normalizer
  fixtures do not establish model extraction accuracy. Use the configured provider
  and a Nextcloud taskprocessing worker; do not change global AI configuration.
- Compare booking and document-link counts before/after, check temporary file cleanup
  and discarded task IDs. The preview only creates core taskprocessing tasks and
  temporary upload files; it must never save a booking or document link.

For newly added routes, verify the exact user-facing hostname. Nextcloud caches route
collections by hostname; a successful test through host.docker.internal does not prove
that an older localhost route cache contains the endpoint. Refresh the local web-server
cache after route changes before checking the user-facing URL.

Temporary preview timing diagnostics are opt-in via the Domus app configuration key
`bookingPreviewTraceUntil` (Unix expiry timestamp). Logs use the message
`Temporary booking preview timing` and include UTC timestamps, correlation/task IDs,
PDF preparation/scheduling/validation durations and core task queue/execution times.
Polling snapshots report the core worker timestamps; they are not provider-internal
traces and cannot distinguish model loading from generation. Document text, paths and
model output are excluded. Clear the key or let it expire to stop logging.

## Unit moves to Teams

- Run `./tests/run-unit.sh --filter UnitMove` for full folder trees (including empty
  folders and unlinked files), external images, duplicate document references,
  interrupted-copy recovery, changed sources/destinations, ownership rollback,
  account conflicts, authorization, cancellation and per-member folder resolution.
- Run `PLAYWRIGHT_TEST=unit-workspace ./tests/run-playwright.sh` for the move preview,
  explicit start, lost-response recovery, cancellation and phone layout.
- Live acceptance requires a Personal fixture unit and a Team with its own folder.
  Verify different source/destination storage IDs, new file IDs, retained originals,
  and a new upload by a second Team member after completion. Also verify the exact
  user-facing hostname's move routes, pending-write rejection and cancellation.
- Migration copies current file contents and Domus metadata. File versions, shares,
  comments and other Nextcloud metadata are not copied. Missing source folders are disclosed in the preview and recreated at the
  destination; unreadable folders or missing/unreadable linked files stop the move. No source or staged files are deleted;
  cancelling releases the write pause and retains destination copies for review.

Run `./tests/run-unit.sh --filter 'TeamScopedMapper|AccountService|UnitMove'`
for Personal account isolation, shared read-only system accounts, and Personal-to-Team
account transfer.

Run `./tests/run-unit.sh --filter 'SystemTaskTemplate|DefaultCatalogueInstall|TaskTemplate|WorkflowRun|DomusMigrationRoundTrip'`
and `PLAYWRIGHT_TEST=system-templates ./tests/run-playwright.sh` for shared templates,
override precedence, Personal/Team isolation, protected steps, customize/reset/disable,
fresh-install account and template seeding, and portable imports.
The browser fixture covers editing, scope switching, reset cancellation, request
failures and phone layout. Live Nextcloud installation/route validation remains separate.

## User deletion

Run `./tests/run-unit.sh --filter 'UserCleanup|BackgroundRuleService|RenterAccess|ManagementAccessContext'`
for transactional Personal-data cleanup, dependent records, Team/history preservation,
repeated cleanup, failed cleanup rollback, renter UID reuse, Domus AI-task cancellation,
and rule evaluation through an authorized remaining Team member. Team actor discovery
uses Nextcloud's seen-user iterator only when persisted actors are no longer eligible;
Teams without an eligible account remain untouched and are reconsidered on the next run.
User deletion removes move journals but retains destination copies. Core handles user
files and preferences; Domus does not delete generic Nextcloud metadata jobs.
For live-test teardown, remove pending `UpdateSingleMetadata` jobs whose arguments
match the exact temporary test UID through `IJobList` before deleting that test account.
Never remove jobs based only on a UID prefix or remove jobs belonging to real users.

## Admin audit events

Run `./tests/run-unit.sh --filter 'Audit|UnitMove|UnitTransfer|UserCleanup'` for
account changes, unchanged relationships, allowed event scope, deletion ordering,
move retries/failures and import commit/rollback behavior. Full tests use a stub
audit dispatcher. Live validation can resolve the affected services through
Nextcloud's container without modifying records. End-to-end audit-file delivery
requires an enabled/configured `admin_audit` app and separate fixture actions.
