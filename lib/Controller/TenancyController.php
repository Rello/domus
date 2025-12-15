<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TenancyService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class TenancyController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private TenancyService $tenancyService,
        private PermissionService $permissionService,
        private IL10N $l10n,
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
        try {
            return new DataResponse($this->tenancyService->getTenancyForUser($id, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function create(int $unitId, string $startDate, ?string $baseRent = null, ?string $endDate = null, ?string $serviceCharge = null, ?int $serviceChargeAsPrepayment = 0, ?string $deposit = null, ?string $conditions = null, array $partnerIds = []): DataResponse {
        $data = compact('unitId', 'startDate', 'endDate', 'baseRent', 'serviceCharge', 'serviceChargeAsPrepayment', 'deposit', 'conditions', 'partnerIds');
        try {
            $tenancy = $this->tenancyService->createTenancy($data, $this->getUserId(), $this->getRole());
            return new DataResponse($tenancy, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function changeConditions(int $id, string $startDate, ?string $baseRent = null, ?string $endDate = null, ?string $serviceCharge = null, ?int $serviceChargeAsPrepayment = 0, ?string $deposit = null, ?string $conditions = null, array $partnerIds = []): DataResponse {
        $data = compact('startDate', 'endDate', 'baseRent', 'serviceCharge', 'serviceChargeAsPrepayment', 'deposit', 'conditions', 'partnerIds');
        try {
            $tenancy = $this->tenancyService->changeConditions($id, $data, $this->getUserId(), $this->getRole());
            return new DataResponse($tenancy, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?int $unitId = null, ?string $startDate = null, ?string $endDate = null, ?string $baseRent = null, ?string $serviceCharge = null, ?int $serviceChargeAsPrepayment = null, ?string $deposit = null, ?string $conditions = null, ?array $partnerIds = null): DataResponse {
        $data = array_filter([
            'unitId' => $unitId,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseRent' => $baseRent,
            'serviceCharge' => $serviceCharge,
            'serviceChargeAsPrepayment' => $serviceChargeAsPrepayment,
            'deposit' => $deposit,
            'conditions' => $conditions,
            'partnerIds' => $partnerIds,
        ], fn($value) => $value !== null);
        try {
            return new DataResponse($this->tenancyService->updateTenancy($id, $data, $this->getUserId(), $this->getRole()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->tenancyService->deleteTenancy($id, $this->getUserId());
            return new DataResponse([], Http::STATUS_NO_CONTENT);
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
