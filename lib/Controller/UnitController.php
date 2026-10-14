<?php

/**
* SPDX-FileCopyrightText: 2025 Marcel Scherello
* SPDX-License-Identifier: AGPL-3.0-or-later
*/

namespace OCA\Domus\Controller;

use OCA\Domus\Http\FileResponse;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\EntityImageService;
use OCA\Domus\Service\ServiceChargeSettlementService;
use OCA\Domus\Service\UnitService;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\UnitTransferService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;

class UnitController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private UnitService $unitService,
        private ServiceChargeSettlementService $settlementService,
        private PermissionService $permissionService,
        private UnitTransferService $unitTransferService,
        private EntityImageService $entityImageService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?int $propertyId = null): DataResponse {
        return new DataResponse($this->unitService->listUnitsForUser($this->getUserId(), $propertyId, $this->getRole()));
    }

    #[NoAdminRequired]
    public function listByProperty(int $propertyId): DataResponse {
        return $this->index($propertyId);
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        return new DataResponse($this->unitService->getUnitForUser($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function imageContent(int $id): FileDisplayResponse|DataResponse {
        return FileResponse::image($this->entityImageService->getUnitImage($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(
        ?int $propertyId,
        string $label,
        ?string $street = null,
        ?string $zip = null,
        ?string $city = null,
        ?string $country = null,
        ?string $unitNumber = null,
        ?string $landRegister = null,
        ?string $livingArea = null,
        ?string $unitType = null,
        ?string $buyDate = null,
        ?string $totalCosts = null,
        ?string $taxId = null,
        ?string $iban = null,
        ?string $bic = null,
        ?string $notes = null
    ): DataResponse {
        $data = compact('propertyId', 'label', 'street', 'zip', 'city', 'country', 'unitNumber', 'landRegister', 'livingArea', 'unitType', 'buyDate', 'totalCosts', 'taxId', 'iban', 'bic', 'notes');
        $unit = $this->unitService->createUnit($data, $this->getUserId(), $this->getRole());
        return new DataResponse($unit, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(
        int $id,
        ?int $propertyId = null,
        ?string $label = null,
        ?string $street = null,
        ?string $zip = null,
        ?string $city = null,
        ?string $country = null,
        ?string $unitNumber = null,
        ?string $landRegister = null,
        ?string $livingArea = null,
        ?string $unitType = null,
        ?string $buyDate = null,
        ?string $totalCosts = null,
        ?string $taxId = null,
        ?string $iban = null,
        ?string $bic = null,
        ?string $notes = null,
        ?string $documentPath = null
    ): DataResponse {
        $data = array_filter([
            'propertyId' => $propertyId,
            'label' => $label,
            'street' => $street,
            'zip' => $zip,
            'city' => $city,
            'country' => $country,
            'unitNumber' => $unitNumber,
            'landRegister' => $landRegister,
            'livingArea' => $livingArea,
            'unitType' => $unitType,
            'buyDate' => $buyDate,
            'totalCosts' => $totalCosts,
            'taxId' => $taxId,
            'iban' => $iban,
            'bic' => $bic,
            'notes' => $notes,
            'documentPath' => $documentPath,
        ], fn($value) => $value !== null);
        return new DataResponse($this->unitService->updateUnit($id, $data, $this->getUserId(), $this->getRole()));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->unitService->deleteUnit($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    #[NoAdminRequired]
    public function deletionSummary(int $id): DataResponse {
        return new DataResponse($this->unitService->getDeletionSummary($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function listSettlements(int $id, ?int $year = null): DataResponse {
        $targetYear = $year ?? ((int)date('Y') - 1);
        return new DataResponse($this->settlementService->listForUnit($this->getUserId(), $id, $targetYear));
    }

    #[NoAdminRequired]
    public function createSettlement(int $id, int $year, int $partnerId): DataResponse {
        $result = $this->settlementService->createReport($this->getUserId(), $id, $year, $partnerId);
        return new DataResponse($result, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function exportDataset(int $id): DataResponse {
        return new DataResponse($this->unitTransferService->exportUnitDataset($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function importDataset(?array $payload = null, ?int $propertyId = null): DataResponse {
        if ($payload === null) {
            throw new \InvalidArgumentException($this->l10n->t('Import data is missing.'));
        }
        $result = $this->unitTransferService->importUnitDataset($payload, $this->getUserId(), $this->getRole(), $propertyId);
        return new DataResponse($result, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function uploadImage(int $id): DataResponse {
        $file = $this->request->getUploadedFile('image') ?: $this->request->getUploadedFile('file');
        if (!$file) {
            throw new \InvalidArgumentException($this->l10n->t('Image file is required.'));
        }

        return new DataResponse($this->entityImageService->uploadUnitImage($id, $file, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function removeImage(int $id): DataResponse {
        return new DataResponse($this->entityImageService->removeUnitImage($id, $this->getUserId()));
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }

    private function getRole(): string {
        return $this->permissionService->getRoleFromRequest($this->request);
    }
}
