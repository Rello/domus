<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\BookingService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class BookingController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private BookingService $bookingService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?int $year = null, ?int $propertyId = null, ?int $unitId = null): DataResponse {
        $filter = array_filter([
            'year' => $year,
            'propertyId' => $propertyId,
            'unitId' => $unitId,
        ], fn($value) => $value !== null);
        return new DataResponse($this->bookingService->listBookings($this->getUserId(), $filter));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->bookingService->getBookingForUser($id, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function create(
        int $account,
        string $date,
        ?string $deliveryDate = null,
        string $amount,
        ?int $propertyId = null,
        ?int $unitId = null,
        ?string $description = null,
        ?int $distributionKeyId = null,
        ?string $periodFrom = null,
        ?string $periodTo = null,
    ): DataResponse {
        $data = compact('account', 'date', 'deliveryDate', 'amount', 'propertyId', 'unitId', 'description', 'distributionKeyId', 'periodFrom', 'periodTo');
        try {
            $booking = $this->bookingService->createBooking($data, $this->getUserId());
            return new DataResponse($booking, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function update(
        int $id,
        ?int $account = null,
        ?string $date = null,
        ?string $deliveryDate = null,
        ?string $amount = null,
        ?int $propertyId = null,
        ?int $unitId = null,
        ?string $description = null,
        ?int $distributionKeyId = null,
        ?string $periodFrom = null,
        ?string $periodTo = null,
    ): DataResponse {
        $data = array_filter([
            'account' => $account,
            'date' => $date,
            'deliveryDate' => $deliveryDate,
            'amount' => $amount,
            'propertyId' => $propertyId,
            'unitId' => $unitId,
            'description' => $description,
            'distributionKeyId' => $distributionKeyId,
            'periodFrom' => $periodFrom,
            'periodTo' => $periodTo,
        ], fn($value) => $value !== null);
        try {
            return new DataResponse($this->bookingService->updateBooking($id, $data, $this->getUserId()));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->bookingService->deleteBooking($id, $this->getUserId());
            return new DataResponse([], Http::STATUS_NO_CONTENT);
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
