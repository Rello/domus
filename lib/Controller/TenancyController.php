<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\TenancyService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class TenancyController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private TenancyService $tenancyService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->tenancyService->list($this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function byUnit(int $unitId): DataResponse {
        return new DataResponse($this->tenancyService->listByUnit($unitId, $this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function byPartner(int $partnerId): DataResponse {
        return new DataResponse($this->tenancyService->listByPartner($partnerId, $this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $tenancy = $this->tenancyService->getById($id, $this->getCurrentUserId());
            return new DataResponse($tenancy);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(int $unitId, string $startDate, float $baseRent, ?int $partnerId = null, ?string $endDate = null,
        ?float $serviceCharge = null, ?bool $serviceChargeAsPrepayment = false, ?float $deposit = null, ?string $conditions = null): DataResponse {
        try {
            $tenancy = $this->tenancyService->create([
                'unitId' => $unitId,
                'partnerId' => $partnerId,
                'startDate' => $startDate,
                'endDate' => $endDate,
                'baseRent' => $baseRent,
                'serviceCharge' => $serviceCharge,
                'serviceChargeAsPrepayment' => $serviceChargeAsPrepayment,
                'deposit' => $deposit,
                'conditions' => $conditions,
            ], $this->getCurrentUserId());
            return new DataResponse($tenancy, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?int $unitId = null, ?int $partnerId = null, ?string $startDate = null, ?string $endDate = null,
        ?float $baseRent = null, ?float $serviceCharge = null, ?bool $serviceChargeAsPrepayment = null,
        ?float $deposit = null, ?string $conditions = null): DataResponse {
        try {
            $data = array_filter([
                'unitId' => $unitId,
                'partnerId' => $partnerId,
                'startDate' => $startDate,
                'endDate' => $endDate,
                'baseRent' => $baseRent,
                'serviceCharge' => $serviceCharge,
                'serviceChargeAsPrepayment' => $serviceChargeAsPrepayment,
                'deposit' => $deposit,
                'conditions' => $conditions,
            ], static fn($v) => $v !== null);
            $tenancy = $this->tenancyService->update($id, $data, $this->getCurrentUserId());
            return new DataResponse($tenancy);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->tenancyService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
