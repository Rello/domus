#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Marcel Scherello
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PHPUNIT_IMAGE="${PHPUNIT_IMAGE:-php-with-phpunit:latest}"

docker run --rm \
  -v "${ROOT_DIR}:/opt/project" \
  -w /opt/project \
  "${PHPUNIT_IMAGE}" \
  php /usr/local/bin/phpunit --configuration /opt/project/phpunit.xml "$@"
