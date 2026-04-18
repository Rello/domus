<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP;

interface IDBConnection {
    public function beginTransaction(): void;

    public function commit(): void;

    public function rollBack(): void;

    public function getQueryBuilder(): mixed;
}
