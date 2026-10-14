<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PartnerService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;

class PartnerController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private PartnerService $partnerService,
        private PermissionService $permissionService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?string $type = null): DataResponse {
        $filteredType = $this->permissionService->filterPartnerListType($type);
        return new DataResponse($this->partnerService->listPartners($this->getUserId(), $filteredType));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        return new DataResponse($this->partnerService->getPartnerForUser($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(string $partnerType, string $name, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $email = null, ?string $phone = null, ?string $customerRef = null, ?string $notes = null, ?string $ncUserId = null): DataResponse {
        $data = compact('partnerType', 'name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'customerRef', 'notes', 'ncUserId');
        $partner = $this->partnerService->createPartner($data, $this->getUserId(), $this->getRole());
        return new DataResponse($partner, Http::STATUS_CREATED);
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
        return new DataResponse($this->partnerService->updatePartner($id, $data, $this->getUserId(), $this->getRole()));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->partnerService->deletePartner($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }

    private function getRole(): string {
        return $this->permissionService->getRoleFromRequest($this->request);
    }
}
