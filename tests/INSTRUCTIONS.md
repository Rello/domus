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

## UI Tests (Playwright)
- Run the modal/form behavioral regression suite: `./tests/run-playwright.sh`.
- The wrapper builds `domus-playwright:local` when missing. Override with
  `PLAYWRIGHT_IMAGE` to use an existing compatible Playwright image.
- Tests load the actual JavaScript modules and CSS in Chromium, with fixture API
  responses. They do not require a Nextcloud login or write server records.
- Coverage includes changed/unchanged forms, dismissal paths, successful/failed
  saves, asynchronous defaults, document selections, nested dialogs, keyboard
  focus, and a narrow viewport. Live Nextcloud checks remain separate.

## License Compliance (REUSE)
- Run REUSE lint:
  - `./tests/run-reuse.sh`
