<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\WorkflowRunService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class WorkflowRunController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
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
            return $this->validationError($this->l10n->t('Template is required.'));
        }
        try {
            $run = $this->workflowRunService->startWorkflowRun($entityType, $entityId, $templateId, $year, $name, $this->getUserId());
            return new DataResponse($run, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_CONFLICT, 'CONFLICT');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->getWorkflowRunsByEntity($entityType, $entityId, $this->getUserId()));
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function show(int $runId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->getWorkflowRun($runId, $this->getUserId()));
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function closeStep(int $stepId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->closeStep($stepId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function reopenStep(int $stepId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->reopenStep($stepId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function delete(int $runId): DataResponse {
        try {
            $this->workflowRunService->deleteRun($runId, $this->getUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function errorResponse(string $message, int $status, string $code): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => $code,
        ], $status);
    }

    private function validationError(string $message): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => 'VALIDATION_ERROR',
        ], Http::STATUS_BAD_REQUEST);
    }
}
