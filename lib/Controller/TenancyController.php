<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TenancyService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;

class TenancyController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private TenancyService $tenancyService,
        private PermissionService $permissionService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->tenancyService->listTenancies($this->getUserId()));
    }

    #[NoAdminRequired]
    public function listByUnit(int $unitId): DataResponse {
        return new DataResponse($this->tenancyService->listTenancies($this->getUserId(), $unitId));
    }

    #[NoAdminRequired]
    public function listByPartner(int $partnerId): DataResponse {
        return new DataResponse($this->tenancyService->listTenancies($this->getUserId(), null, $partnerId));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        return new DataResponse($this->tenancyService->getTenancyForUser($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(int $unitId, string $startDate, ?string $baseRent = null, ?string $endDate = null, ?string $serviceCharge = null, ?string $deposit = null, ?string $conditions = null, array $partnerIds = []): DataResponse {
        $data = compact('unitId', 'startDate', 'endDate', 'baseRent', 'serviceCharge', 'deposit', 'conditions', 'partnerIds');
        $tenancy = $this->tenancyService->createTenancy($data, $this->getUserId(), $this->getRole());
        return new DataResponse($tenancy, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function changeConditions(int $id, string $startDate, ?string $baseRent = null, ?string $endDate = null, ?string $serviceCharge = null, ?string $deposit = null, ?string $conditions = null, array $partnerIds = []): DataResponse {
        $data = compact('startDate', 'endDate', 'baseRent', 'serviceCharge', 'deposit', 'conditions', 'partnerIds');
        $tenancy = $this->tenancyService->changeConditions($id, $data, $this->getUserId(), $this->getRole());
        return new DataResponse($tenancy, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(int $id, ?int $unitId = null, ?string $startDate = null, ?string $endDate = null, ?string $baseRent = null, ?string $serviceCharge = null, ?string $deposit = null, ?string $conditions = null, ?array $partnerIds = null): DataResponse {
        $data = array_filter([
            'unitId' => $unitId,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseRent' => $baseRent,
            'serviceCharge' => $serviceCharge,
            'deposit' => $deposit,
            'conditions' => $conditions,
            'partnerIds' => $partnerIds,
        ], fn($value) => $value !== null);
        return new DataResponse($this->tenancyService->updateTenancy($id, $data, $this->getUserId(), $this->getRole()));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->tenancyService->deleteTenancy($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }

    private function getRole(): string {
        return $this->permissionService->getRoleFromRequest($this->request);
    }
}
