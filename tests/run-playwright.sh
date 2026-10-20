#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Marcel Scherello
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

rootDir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwrightImage="${PLAYWRIGHT_IMAGE:-domus-playwright:local}"
if ! docker image inspect "$playwrightImage" >/dev/null 2>&1; then
    docker build -t "$playwrightImage" "$rootDir/tests/playwright"
fi
suites=(dialog-template routing modal-changes dashboard unit-workspace process-detail task-creation analytics contacts renter-preview team-context renter-access renter-portal view-lifecycle ui-reuse rules document-templates)
if [[ -n "${PLAYWRIGHT_TEST:-}" ]]; then
    [[ "$PLAYWRIGHT_TEST" =~ ^[a-z-]+$ ]] || exit 2
    suites=("$PLAYWRIGHT_TEST")
fi
for suite in "${suites[@]}"; do
    docker run --rm --init --ipc=host --entrypoint node \
        -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
        "$playwrightImage" "tests/playwright/$suite.js"
done
