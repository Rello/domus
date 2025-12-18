<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\DistributionKeyService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class DistributionController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private DistributionKeyService $distributionKeyService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByProperty(int $propertyId, ?int $unitId = null): DataResponse {
        try {
            return new DataResponse($this->distributionKeyService->listForProperty($this->getUserId(), $propertyId, $this->getRole(), $unitId));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function createForProperty(int $propertyId, string $type, string $name, string $validFrom, ?string $configJson = null, ?string $validTo = null): DataResponse {
        $payload = compact('type', 'name', 'validFrom', 'configJson', 'validTo');
        try {
            $created = $this->distributionKeyService->createDistributionKey($propertyId, $payload, $this->getUserId(), $this->getRole());
            return new DataResponse($created, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function createForUnit(int $unitId, int $distributionKeyId, string $value, string $validFrom, ?string $validTo = null): DataResponse {
        $payload = compact('distributionKeyId', 'value', 'validFrom', 'validTo');
        try {
            $result = $this->distributionKeyService->createUnitValue($unitId, $payload, $this->getUserId(), $this->getRole());
            return new DataResponse($result, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId): DataResponse {
        try {
            return new DataResponse($this->distributionKeyService->listForUnit($unitId, $this->getUserId(), $this->getRole()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function getRole(): string {
        return $this->permissionService->getRoleFromRequest($this->request);
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
