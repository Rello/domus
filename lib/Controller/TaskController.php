<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\TaskService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;

class TaskController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private TaskService $taskService,
        private PermissionService $permissionService,
        private IL10N $l10n,
        private \OCA\Domus\Service\RuleService $rules,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function createForEntity(string $entityType, int $entityId): DataResponse {
        $payload = $this->request->getParams();
        $title = trim((string)($payload['title'] ?? ''));
        $description = $payload['description'] ?? null;
        $dueDate = $payload['dueDate'] ?? null;
        $task = $this->taskService->createTask($entityType, $entityId, $title, $description, $dueDate, $this->getUserId());
        return new DataResponse($task, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId, ?string $status = null): DataResponse {
        $this->rules->evaluate($this->getUserId());
        return new DataResponse($this->taskService->listTasksByEntity($entityType, $entityId, $this->getUserId(), $status));
    }

    #[NoAdminRequired]
    public function listOpen(?string $status = null, ?string $entityType = null, ?int $entityId = null): DataResponse {
        $this->rules->evaluate($this->getUserId());
        $role = $this->permissionService->getRoleFromRequest($this->request);
        $status = $status ?: 'open';
        if ($status !== 'open') {
            throw new \InvalidArgumentException($this->l10n->t('Invalid status.'));
        }
        return new DataResponse($this->taskService->listOpenTasks($this->getUserId(), $role, $entityType, $entityId));
    }

    #[NoAdminRequired]
    public function update(int $taskId): DataResponse {
        $payload = $this->request->getParams();
        $title = trim((string)($payload['title'] ?? ''));
        $description = $payload['description'] ?? null;
        $dueDate = $payload['dueDate'] ?? null;

        return new DataResponse($this->taskService->updateTask($taskId, $title, $description, $dueDate, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function close(int $taskId): DataResponse {
        return new DataResponse($this->taskService->closeTask($taskId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function reopen(int $taskId): DataResponse {
        return new DataResponse($this->taskService->reopenTask($taskId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function delete(int $taskId): DataResponse {
        $this->taskService->deleteTask($taskId, $this->getUserId());
        return new DataResponse(['status' => 'success']);
    }

    #[NoAdminRequired]
    public function remind(int $taskId, string $choice, ?string $date = null): DataResponse {
        $this->rules->remindTask($taskId, $choice, $date, $this->getUserId());
        return new DataResponse([]);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
