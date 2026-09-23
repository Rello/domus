<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP;

interface IConfig {
    public function getUserValue(string $userId, string $appName, string $key, mixed $default = ''): string;

    public function setUserValue(string $userId, string $appName, string $key, mixed $value): void;
}
