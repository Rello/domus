<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PartnerRelationService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class PartnerRelationController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private PartnerRelationService $partnerRelationService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId): DataResponse {
        try {
            return new DataResponse($this->partnerRelationService->listPartnersForUnit($unitId, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function listByProperty(int $propertyId): DataResponse {
        try {
            return new DataResponse($this->partnerRelationService->listPartnersForProperty($propertyId, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function createForUnit(int $unitId, ?int $partnerId = null, ?string $partnerType = null, ?string $name = null, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        $data = compact('partnerId', 'partnerType', 'name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'customerRef', 'notes', 'ncUserId');
        try {
            $partner = $this->partnerRelationService->createRelation('unit', $unitId, $data, $this->getUserId(), $this->getRole());
            return new DataResponse($partner, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function createForProperty(int $propertyId, ?int $partnerId = null, ?string $partnerType = null, ?string $name = null, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        $data = compact('partnerId', 'partnerType', 'name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'customerRef', 'notes', 'ncUserId');
        try {
            $partner = $this->partnerRelationService->createRelation('property', $propertyId, $data, $this->getUserId(), $this->getRole());
            return new DataResponse($partner, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\RuntimeException $e) {
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
