<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP\UserMigration;

interface IExportDestination {
    public function addFileAsStream(string $path, $stream): void;

    public function addFileContents(string $path, string $contents): void;
}
