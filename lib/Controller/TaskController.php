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
    public function createForEntity(string $entityType, int $entityId): DataResponse {
        $payload = $this->request->getParams();
        $title = trim((string)($payload['title'] ?? ''));
        $description = $payload['description'] ?? null;
        $dueDate = $payload['dueDate'] ?? null;
        try {
            $task = $this->taskService->createTask($entityType, $entityId, $title, $description, $dueDate, $this->getUserId());
            return new DataResponse($task, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId, ?string $status = null): DataResponse {
        try {
            return new DataResponse($this->taskService->listTasksByEntity($entityType, $entityId, $this->getUserId(), $status));
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function listOpen(?string $status = null, ?string $entityType = null, ?int $entityId = null): DataResponse {
        $role = $this->request->getHeader('X-Domus-Role') ?: $this->request->getParam('role') ?: 'landlord';
        $status = $status ?: 'open';
        if ($status !== 'open') {
            return $this->validationError($this->l10n->t('Invalid status.'));
        }
        try {
            return new DataResponse($this->taskService->listOpenTasks($this->getUserId(), $role, $entityType, $entityId));
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function close(int $taskId): DataResponse {
        try {
            return new DataResponse($this->taskService->closeTask($taskId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function reopen(int $taskId): DataResponse {
        try {
            return new DataResponse($this->taskService->reopenTask($taskId, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function delete(int $taskId): DataResponse {
        try {
            $this->taskService->deleteTask($taskId, $this->getUserId());
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
