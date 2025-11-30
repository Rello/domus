<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\UnitService;
use OCP\AppFramework\Attributes\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class UnitController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private UnitService $unitService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->unitService->list($this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function byProperty(int $propertyId): DataResponse {
        return new DataResponse($this->unitService->listByProperty($propertyId, $this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $unit = $this->unitService->getById($id, $this->getCurrentUserId());
            return new DataResponse($unit);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(int $propertyId, string $label, ?string $unitNumber = null, ?string $landRegister = null,
        ?float $livingArea = null, ?float $usableArea = null, ?string $unitType = null, ?string $notes = null): DataResponse {
        try {
            $unit = $this->unitService->create([
                'propertyId' => $propertyId,
                'label' => $label,
                'unitNumber' => $unitNumber,
                'landRegister' => $landRegister,
                'livingArea' => $livingArea,
                'usableArea' => $usableArea,
                'unitType' => $unitType,
                'notes' => $notes,
            ], $this->getCurrentUserId());
            return new DataResponse($unit, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?int $propertyId = null, ?string $label = null, ?string $unitNumber = null,
        ?string $landRegister = null, ?float $livingArea = null, ?float $usableArea = null,
        ?string $unitType = null, ?string $notes = null): DataResponse {
        try {
            $data = array_filter([
                'propertyId' => $propertyId,
                'label' => $label,
                'unitNumber' => $unitNumber,
                'landRegister' => $landRegister,
                'livingArea' => $livingArea,
                'usableArea' => $usableArea,
                'unitType' => $unitType,
                'notes' => $notes,
            ], static fn($v) => $v !== null);
            $unit = $this->unitService->update($id, $data, $this->getCurrentUserId());
            return new DataResponse($unit);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->unitService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
