<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\UnitService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class UnitController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private UnitService $unitService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?int $propertyId = null): DataResponse {
        return new DataResponse($this->unitService->listUnitsForUser($this->getUserId(), $propertyId));
    }

    #[NoAdminRequired]
    public function listByProperty(int $propertyId): DataResponse {
        return $this->index($propertyId);
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->unitService->getUnitForUser($id, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function create(?int $propertyId, string $label, ?string $unitNumber = null, ?string $landRegister = null, ?string $livingArea = null, ?string $usableArea = null, ?string $unitType = null, ?string $buyDate = null, ?string $totalCosts = null, ?string $officialId = null, ?string $iban = null, ?string $bic = null, ?string $notes = null): DataResponse {
        $data = compact('propertyId', 'label', 'unitNumber', 'landRegister', 'livingArea', 'usableArea', 'unitType', 'buyDate', 'totalCosts', 'officialId', 'iban', 'bic', 'notes');
        try {
            $unit = $this->unitService->createUnit($data, $this->getUserId());
            return new DataResponse($unit, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?int $propertyId = null, ?string $label = null, ?string $unitNumber = null, ?string $landRegister = null, ?string $livingArea = null, ?string $usableArea = null, ?string $unitType = null, ?string $buyDate = null, ?string $totalCosts = null, ?string $officialId = null, ?string $iban = null, ?string $bic = null, ?string $notes = null): DataResponse {
        $data = array_filter([
            'propertyId' => $propertyId,
            'label' => $label,
            'unitNumber' => $unitNumber,
            'landRegister' => $landRegister,
            'livingArea' => $livingArea,
            'usableArea' => $usableArea,
            'unitType' => $unitType,
            'buyDate' => $buyDate,
            'totalCosts' => $totalCosts,
            'officialId' => $officialId,
            'iban' => $iban,
            'bic' => $bic,
            'notes' => $notes,
        ], fn($value) => $value !== null);
        try {
            return new DataResponse($this->unitService->updateUnit($id, $data, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->unitService->deleteUnit($id, $this->getUserId());
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
