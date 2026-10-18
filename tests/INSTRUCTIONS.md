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
process steps. Reminder tests verify unchanged deadlines, hidden sleeping tasks,
expiry, and process access boundaries. Task lifecycle tests cover expiry rechecks, rent changes,
completion/deletion, rule disabling, invalid dates, and unauthorized reminders. The PHP rule tests cover calendar thresholds,
unknown history, ownership boundaries, scope selection, duplicate-task prevention,
snooze expiry, resolution, and background ownership-context restoration.

Run `PLAYWRIGHT_TEST=routing ./tests/run-playwright.sh` for path-based deep links,
reload initialization, browser Back/Forward, encoded route
arguments, subdirectory installations, and renter navigation restrictions.
