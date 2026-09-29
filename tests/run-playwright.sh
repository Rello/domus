#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Marcel Scherello
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

rootDir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwrightImage="${PLAYWRIGHT_IMAGE:-domus-playwright:local}"
if ! docker image inspect "$playwrightImage" >/dev/null 2>&1; then
    docker build -t "$playwrightImage" "$rootDir/tests/playwright"
fi
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/modal-changes.js
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/dashboard.js
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/unit-workspace.js
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/process-detail.js
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/task-creation.js

docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/analytics.js
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:ro" -w /work -e NODE_PATH=/app/node_modules \
    "$playwrightImage" tests/playwright/contacts.js
