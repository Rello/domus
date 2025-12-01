<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\PartnerService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class PartnerController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private PartnerService $partnerService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]

    public function index(): DataResponse {
        return new DataResponse($this->partnerService->list($this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $partner = $this->partnerService->getById($id, $this->getCurrentUserId());
            return new DataResponse($partner);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(string $name, string $partnerType, ?string $street = null, ?string $zip = null, ?string $city = null,
        ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null,
        ?string $notes = null, ?string $ncUserId = null): DataResponse {
        try {
            $partner = $this->partnerService->create([
                'name' => $name,
                'partnerType' => $partnerType,
                'street' => $street,
                'zip' => $zip,
                'city' => $city,
                'country' => $country,
                'email' => $email,
                'phone' => $phone,
                'customerRef' => $customerRef,
                'notes' => $notes,
                'ncUserId' => $ncUserId,
            ], $this->getCurrentUserId());
            return new DataResponse($partner, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $name = null, ?string $partnerType = null, ?string $street = null, ?string $zip = null,
        ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null,
        ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        try {
            $data = array_filter([
                'name' => $name,
                'partnerType' => $partnerType,
                'street' => $street,
                'zip' => $zip,
                'city' => $city,
                'country' => $country,
                'email' => $email,
                'phone' => $phone,
                'customerRef' => $customerRef,
                'notes' => $notes,
                'ncUserId' => $ncUserId,
            ], static fn($v) => $v !== null);
            $partner = $this->partnerService->update($id, $data, $this->getCurrentUserId());
            return new DataResponse($partner);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->partnerService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
