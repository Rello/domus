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
will folow later

## License Compliance (REUSE)
- Run REUSE lint:
  - `./tests/run-reuse.sh`

Notes:
- Default container image: `fsfe/reuse`
- Override image if needed:
  - `REUSE_IMAGE=fsfe/reuse:latest ./tests/run-reuse.sh`
