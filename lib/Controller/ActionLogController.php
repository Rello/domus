<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\ActionLogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class ActionLogController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private ActionLogService $actionLogService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId, ?int $limit = null, ?int $offset = null): DataResponse {
        return new DataResponse($this->actionLogService->listForEntity($this->getUserId(), $entityType, $entityId, $limit, $offset ?? 0));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        return new DataResponse($this->actionLogService->getEntry($this->getUserId(), $id));
    }

    #[NoAdminRequired]
    public function createForEntity(string $entityType, int $entityId): DataResponse {
        $payload = $this->request->getParams();

        $entry = $this->actionLogService->createManualEntry($this->getUserId(), $entityType, $entityId, [
            'type' => $payload['type'] ?? null,
            'title' => $payload['title'] ?? null,
            'data' => $payload['data'] ?? null,
            'linkedEntityType' => $payload['linkedEntityType'] ?? null,
            'linkedEntityId' => $payload['linkedEntityId'] ?? null,
            'linkedLabel' => $payload['linkedLabel'] ?? null,
        ]);

        return new DataResponse($entry, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(int $id): DataResponse {
        $payload = $this->request->getParams();

        return new DataResponse($this->actionLogService->updateEntry($this->getUserId(), $id, [
            'type' => $payload['type'] ?? null,
            'title' => $payload['title'] ?? null,
            'data' => $payload['data'] ?? null,
            'linkedEntityType' => $payload['linkedEntityType'] ?? null,
            'linkedEntityId' => $payload['linkedEntityId'] ?? null,
            'linkedLabel' => $payload['linkedLabel'] ?? null,
        ]));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->actionLogService->deleteEntry($this->getUserId(), $id);
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
