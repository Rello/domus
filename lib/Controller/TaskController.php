<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TaskService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
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
    public function createForUnit(int $unitId): DataResponse {
        $payload = $this->request->getParams();
        $title = trim((string)($payload['title'] ?? ''));
        $description = $payload['description'] ?? null;
        $dueDate = $payload['dueDate'] ?? null;
        try {
            $task = $this->taskService->createTask($unitId, $title, $description, $dueDate, $this->getUserId());
            return new DataResponse($task, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId, ?string $status = null): DataResponse {
        try {
            return new DataResponse($this->taskService->listTasksByUnit($unitId, $this->getUserId(), $status));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function listOpen(?string $status = null): DataResponse {
        $role = $this->request->getHeader('X-Domus-Role') ?: $this->request->getParam('role') ?: 'landlord';
        $status = $status ?: 'open';
        if ($status !== 'open') {
            return $this->validationError($this->l10n->t('Invalid status.'));
        }
        try {
            return new DataResponse($this->taskService->listOpenTasks($this->getUserId(), $role));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function close(int $taskId): DataResponse {
        try {
            return new DataResponse($this->taskService->closeTask($taskId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function reopen(int $taskId): DataResponse {
        try {
            return new DataResponse($this->taskService->reopenTask($taskId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
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
