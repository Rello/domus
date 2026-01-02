<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PartnerService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class PartnerController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private PartnerService $partnerService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?string $type = null): DataResponse {
        try {
            $filteredType = $this->permissionService->filterPartnerListType($type);
            return new DataResponse($this->partnerService->listPartners($this->getUserId(), $filteredType));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->partnerService->getPartnerForUser($id, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function create(string $partnerType, string $name, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        $data = compact('partnerType', 'name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'customerRef', 'notes', 'ncUserId');
        try {
            $partner = $this->partnerService->createPartner($data, $this->getUserId(), $this->getRole());
            return new DataResponse($partner, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $partnerType = null, ?string $name = null, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        $data = array_filter([
            'partnerType' => $partnerType,
            'name' => $name,
            'street' => $street,
            'zip' => $zip,
            'city' => $city,
            'country' => $country,
            'email' => $email,
            'phone' => $phone,
            'customerRef' => $customerRef,
            'notes' => $notes,
            'ncUserId' => $ncUserId,
        ], fn($value) => $value !== null);
        try {
            return new DataResponse($this->partnerService->updatePartner($id, $data, $this->getUserId(), $this->getRole()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->partnerService->deletePartner($id, $this->getUserId());
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
