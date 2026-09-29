#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Marcel Scherello
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

rootDir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwrightImage="${PLAYWRIGHT_IMAGE:-domus-playwright:local}"
domusUser="${DOMUS_USER:-}"
domusPassword="${DOMUS_PASSWORD:-}"

if [[ -z "$domusUser" || -z "$domusPassword" ]]; then
    while IFS= read -r entry; do
        case "$entry" in
            NEXTCLOUD_ADMIN_USER=*)
                [[ -n "$domusUser" ]] || domusUser="${entry#*=}"
                ;;
            NEXTCLOUD_ADMIN_PASSWORD=*)
                [[ -n "$domusPassword" ]] || domusPassword="${entry#*=}"
                ;;
        esac
    done < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' nc35-app-1)
fi

if [[ -z "$domusUser" || -z "$domusPassword" ]]; then
    echo 'Set DOMUS_USER and DOMUS_PASSWORD, or start the local nc35-app-1 container.' >&2
    exit 1
fi

if ! docker image inspect "$playwrightImage" >/dev/null 2>&1; then
    docker build -t "$playwrightImage" "$rootDir/tests/playwright"
fi

export DOMUS_USER="$domusUser" DOMUS_PASSWORD="$domusPassword"
docker run --rm --init --ipc=host --entrypoint node \
    -v "$rootDir:/work:rw" -w /work \
    -e NODE_PATH=/app/node_modules \
    -e DOMUS_USER -e DOMUS_PASSWORD \
    -e DOMUS_PREVIEW_DIR \
    -e DOMUS_BASE_URL="${DOMUS_BASE_URL:-http://host.docker.internal:8035}" \
    "$playwrightImage" tests/playwright/capture-wizard-screenshots.js
