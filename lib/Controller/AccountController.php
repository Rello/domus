<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\AccountService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class AccountController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private AccountService $accountService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->accountService->getHierarchyForUser($this->getUserId(), $this->l10n));
    }

    #[NoAdminRequired]
    public function create(string $number, ?string $labelDe = null, ?string $labelEn = null, ?int $parentId = null, ?int $sortOrder = null): DataResponse {
        $data = compact('number', 'labelDe', 'labelEn', 'parentId', 'sortOrder');
        try {
            $account = $this->accountService->createAccount($data);
            return new DataResponse($account, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $number = null, ?string $labelDe = null, ?string $labelEn = null, ?int $parentId = null, ?int $sortOrder = null): DataResponse {
        $data = array_filter([
            'number' => $number,
            'labelDe' => $labelDe,
            'labelEn' => $labelEn,
            'parentId' => $parentId,
            'sortOrder' => $sortOrder,
        ], fn($value) => $value !== null);
        try {
            return new DataResponse($this->accountService->updateAccount($id, $data));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function disable(int $id): DataResponse {
        try {
            return new DataResponse($this->accountService->setStatus($id, 'disabled', $this->getUserId()));
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function enable(int $id): DataResponse {
        try {
            return new DataResponse($this->accountService->setStatus($id, 'active', $this->getUserId()));
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->accountService->deleteAccount($id, $this->getUserId());
            return new DataResponse([], Http::STATUS_NO_CONTENT);
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
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
