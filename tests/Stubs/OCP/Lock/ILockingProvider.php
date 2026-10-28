<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\Lock;

interface ILockingProvider {
    public const LOCK_SHARED = 1;
    public const LOCK_EXCLUSIVE = 2;
    public function acquireLock(string $path, int $type, ?string $readablePath = null): void;
    public function releaseLock(string $path, int $type): void;
}
