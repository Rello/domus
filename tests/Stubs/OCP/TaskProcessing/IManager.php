<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\TaskProcessing;
interface IManager {
    public function getAvailableTaskTypeIds(bool $showDisabled = false, ?string $userId = null): array;
    public function getUserTasksByApp(?string $userId, string $appId, ?string $customId = null): array;
    public function scheduleTask(Task $task): void;
    public function getUserTask(int $id, ?string $userId): Task;
    public function cancelTask(int $id): void;
    public function deleteTask(Task $task): void;
}
