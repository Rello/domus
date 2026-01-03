<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TaskService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

class TaskController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private TaskService $taskService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId, ?int $year = null): DataResponse {
        $year = $year ?? (int)date('Y');

        try {
            return new DataResponse($this->taskService->getTasksForUnitYear($this->getUserId(), $unitId, $year));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $status = null, ?string $notes = null): DataResponse {
        try {
            return new DataResponse($this->taskService->updateTask($this->getUserId(), $id, $status, $notes));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function summary(?int $year = null, ?int $propertyId = null, ?int $unitId = null): DataResponse {
        $year = $year ?? (int)date('Y');

        try {
            return new DataResponse($this->taskService->getSummary($this->getUserId(), $year, $propertyId, $unitId));
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
