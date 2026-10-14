<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP\Teams;

interface ITeamManager {
    public function hasTeamSupport(): bool;
    public function getTeamsForUser(string $userId): array;
    public function getTeamFolderProvider();
}
