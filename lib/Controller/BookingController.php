<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\BookingService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class BookingController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private BookingService $bookingService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->bookingService->list($this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $booking = $this->bookingService->getById($id, $this->getCurrentUserId());
            return new DataResponse($booking);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(string $bookingType, string $category, float $amount, string $date, ?int $propertyId = null,
        ?int $unitId = null, ?int $tenancyId = null, ?string $description = null): DataResponse {
        try {
            $booking = $this->bookingService->create([
                'bookingType' => $bookingType,
                'category' => $category,
                'amount' => $amount,
                'date' => $date,
                'propertyId' => $propertyId,
                'unitId' => $unitId,
                'tenancyId' => $tenancyId,
                'description' => $description,
            ], $this->getCurrentUserId());
            return new DataResponse($booking, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $bookingType = null, ?string $category = null, ?float $amount = null,
        ?string $date = null, ?int $propertyId = null, ?int $unitId = null, ?int $tenancyId = null,
        ?string $description = null): DataResponse {
        try {
            $data = array_filter([
                'bookingType' => $bookingType,
                'category' => $category,
                'amount' => $amount,
                'date' => $date,
                'propertyId' => $propertyId,
                'unitId' => $unitId,
                'tenancyId' => $tenancyId,
                'description' => $description,
            ], static fn($v) => $v !== null);
            $booking = $this->bookingService->update($id, $data, $this->getCurrentUserId());
            return new DataResponse($booking);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->bookingService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
