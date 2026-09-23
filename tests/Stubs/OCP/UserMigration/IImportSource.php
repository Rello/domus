<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP\UserMigration;

interface IImportSource {
    public function getFileAsStream(string $path);

    public function pathExists(string $path): bool;

    public function getFileContents(string $path): string;

    public function getMigratorVersion(string $id): ?int;
}
