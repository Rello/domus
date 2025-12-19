<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\DistributionKeyService;
use OCA\Domus\Service\DistributionService;
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
        private DistributionService $distributionService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByProperty(int $propertyId, ?int $unitId = null): DataResponse {
        return new DataResponse($this->distributionKeyService->listForProperty($this->getUserId(), $propertyId, $this->getRole(), $unitId));
    }

    #[NoAdminRequired]
    public function createForProperty(int $propertyId, string $type, string $name, string $validFrom, ?string $configJson = null, ?string $validTo = null): DataResponse {
        $payload = compact('type', 'name', 'validFrom', 'configJson', 'validTo');
        $created = $this->distributionKeyService->createDistributionKey($propertyId, $payload, $this->getUserId(), $this->getRole());
        return new DataResponse($created, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function createForUnit(int $unitId, int $distributionKeyId, string $value, string $validFrom, ?string $validTo = null): DataResponse {
        $payload = compact('distributionKeyId', 'value', 'validFrom', 'validTo');
        $result = $this->distributionKeyService->createUnitValue($unitId, $payload, $this->getUserId(), $this->getRole());
        return new DataResponse($result, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId): DataResponse {
        return new DataResponse($this->distributionKeyService->listForUnit($unitId, $this->getUserId(), $this->getRole()));
    }

    #[NoAdminRequired]
    public function updateForProperty(int $propertyId, int $distributionId, string $name, string $validFrom, ?string $validTo = null, ?string $configJson = null): DataResponse {
        $payload = compact('name', 'validFrom', 'validTo', 'configJson');
        $updated = $this->distributionKeyService->updateDistributionKey($propertyId, $distributionId, $payload, $this->getUserId(), $this->getRole());
        return new DataResponse($updated);
    }

    #[NoAdminRequired]
    public function previewBooking(int $bookingId): DataResponse {
        $role = $this->getRole();
        if (!$this->permissionService->isBuildingManagement($role)) {
            return $this->validationError($this->l10n->t('Distribution preview is only available for building management.'));
        }
        $preview = $this->distributionService->calculatePreview($bookingId, $this->getUserId());
        return new DataResponse($preview);
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
