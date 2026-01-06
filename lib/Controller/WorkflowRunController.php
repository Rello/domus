<?php

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
    public function createForUnit(int $unitId): DataResponse {
        $payload = $this->request->getParams();
        $templateId = isset($payload['templateId']) ? (int)$payload['templateId'] : 0;
        $year = isset($payload['year']) ? (int)$payload['year'] : null;
        $name = isset($payload['name']) ? (string)$payload['name'] : null;
        if ($templateId <= 0) {
            return $this->validationError($this->l10n->t('Template is required.'));
        }
        try {
            $run = $this->workflowRunService->startWorkflowRun($unitId, $templateId, $year, $name, $this->getUserId());
            return new DataResponse($run, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
        }
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->getWorkflowRunsByUnit($unitId, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function show(int $runId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->getWorkflowRun($runId, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function closeStep(int $stepId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->closeStep($stepId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function reopenStep(int $stepId): DataResponse {
        try {
            return new DataResponse($this->workflowRunService->reopenStep($stepId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function delete(int $runId): DataResponse {
        try {
            $this->workflowRunService->deleteRun($runId, $this->getUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function notFound(): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $this->l10n->t('Resource not found.'),
            'code' => 'NOT_FOUND',
        ], Http::STATUS_NOT_FOUND);
    }

    private function validationError(string $message): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => 'VALIDATION_ERROR',
        ], Http::STATUS_BAD_REQUEST);
    }
}
