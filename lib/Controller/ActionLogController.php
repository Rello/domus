<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\ActionLogService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class ActionLogController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private ActionLogService $actionLogService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByEntity(string $entityType, int $entityId, ?int $limit = null, ?int $offset = null): DataResponse {
        try {
            return new DataResponse($this->actionLogService->listForEntity($this->getUserId(), $entityType, $entityId, $limit, $offset ?? 0));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->actionLogService->getEntry($this->getUserId(), $id));
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_NOT_FOUND, 'NOT_FOUND');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function createForEntity(string $entityType, int $entityId): DataResponse {
        $payload = $this->request->getParams();

        try {
            $entry = $this->actionLogService->createManualEntry($this->getUserId(), $entityType, $entityId, [
                'type' => $payload['type'] ?? null,
                'title' => $payload['title'] ?? null,
                'data' => $payload['data'] ?? null,
                'linkedEntityType' => $payload['linkedEntityType'] ?? null,
                'linkedEntityId' => $payload['linkedEntityId'] ?? null,
                'linkedLabel' => $payload['linkedLabel'] ?? null,
            ]);

            return new DataResponse($entry, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function update(int $id): DataResponse {
        $payload = $this->request->getParams();

        try {
            return new DataResponse($this->actionLogService->updateEntry($this->getUserId(), $id, [
                'type' => $payload['type'] ?? null,
                'title' => $payload['title'] ?? null,
                'data' => $payload['data'] ?? null,
                'linkedEntityType' => $payload['linkedEntityType'] ?? null,
                'linkedEntityId' => $payload['linkedEntityId'] ?? null,
                'linkedLabel' => $payload['linkedLabel'] ?? null,
            ]));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_BAD_REQUEST, 'RUNTIME_ERROR');
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->actionLogService->deleteEntry($this->getUserId(), $id);
            return new DataResponse([], Http::STATUS_NO_CONTENT);
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
