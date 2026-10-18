<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\WorkflowRunService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;

class WorkflowRunController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private WorkflowRunService $workflowRunService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function createForEntity(string $entityType, int $entityId): DataResponse {
        $payload = $this->request->getParams();
        $templateId = isset($payload['templateId']) ? (int)$payload['templateId'] : 0;
        $year = isset($payload['year']) ? (int)$payload['year'] : null;
        $name = isset($payload['name']) ? (string)$payload['name'] : null;
        if ($templateId <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Template is required.'));
        }
        $run = $this->workflowRunService->startWorkflowRun($entityType, $entityId, $templateId, $year, $name, $this->getUserId());
        return new DataResponse($run, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId): DataResponse {
        return new DataResponse($this->workflowRunService->getWorkflowRunsByEntity($entityType, $entityId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function show(int $runId): DataResponse {
        return new DataResponse($this->workflowRunService->getWorkflowRun($runId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function remindStep(int $stepId, string $choice, ?string $date = null): DataResponse {
        return new DataResponse($this->workflowRunService->remindStep($stepId, $choice, $date, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function closeStep(int $stepId): DataResponse {
        return new DataResponse($this->workflowRunService->closeStep($stepId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function closeEarly(int $stepId): DataResponse {
        return new DataResponse($this->workflowRunService->closeEarly($stepId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function reopenStep(int $stepId): DataResponse {
        return new DataResponse($this->workflowRunService->reopenStep($stepId, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function delete(int $runId): DataResponse {
        $this->workflowRunService->deleteRun($runId, $this->getUserId());
        return new DataResponse(['status' => 'success']);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
