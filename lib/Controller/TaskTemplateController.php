<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TaskTemplateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\AdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;

class TaskTemplateController extends Controller {
    public function __construct(
        IRequest $request,
        private TaskTemplateService $taskTemplateService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[AdminRequired]
    public function index(?int $activeOnly = 1): DataResponse {
        return new DataResponse($this->taskTemplateService->listTemplates((bool)$activeOnly));
    }

    #[AdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->taskTemplateService->getTemplateWithSteps($id));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[AdminRequired]
    public function create(): DataResponse {
        $payload = $this->request->getParams();
        try {
            $template = $this->taskTemplateService->createTemplate($payload);
            return new DataResponse($template, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[AdminRequired]
    public function update(int $id): DataResponse {
        $payload = $this->request->getParams();
        try {
            return new DataResponse($this->taskTemplateService->updateTemplate($id, $payload));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[AdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->taskTemplateService->deleteTemplate($id);
            return new DataResponse([], Http::STATUS_NO_CONTENT);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[AdminRequired]
    public function reorderSteps(int $id): DataResponse {
        $payload = $this->request->getParams();
        $orderedStepIds = $payload['orderedStepIds'] ?? [];
        try {
            return new DataResponse([
                'steps' => $this->taskTemplateService->reorderSteps($id, $orderedStepIds),
            ]);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[AdminRequired]
    public function addStep(int $id): DataResponse {
        $payload = $this->request->getParams();
        try {
            return new DataResponse($this->taskTemplateService->addOrUpdateStep($id, $payload), Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[AdminRequired]
    public function updateStep(int $stepId): DataResponse {
        $payload = $this->request->getParams();
        $payload['id'] = $stepId;
        $templateId = isset($payload['templateId']) ? (int)$payload['templateId'] : 0;
        if ($templateId <= 0) {
            return $this->validationError($this->l10n->t('Template is required.'));
        }
        try {
            return new DataResponse($this->taskTemplateService->addOrUpdateStep($templateId, $payload));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[AdminRequired]
    public function deleteStep(int $stepId): DataResponse {
        try {
            $this->taskTemplateService->deleteStep($stepId);
            return new DataResponse([], Http::STATUS_NO_CONTENT);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
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
