<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\BookingService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;

class BookingController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private BookingService $bookingService,
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
        return new DataResponse($this->bookingService->getBookingForUser($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(
        int $account,
        string $date,
        string $amount,
        ?string $deliveryDate = null,
        ?int $propertyId = null,
        ?int $unitId = null,
        ?string $description = null,
        ?int $distributionKeyId = null,
        ?string $periodFrom = null,
        ?string $periodTo = null,
    ): DataResponse {
        $data = compact('account', 'date', 'deliveryDate', 'amount', 'propertyId', 'unitId', 'description', 'distributionKeyId', 'periodFrom', 'periodTo');
        $booking = $this->bookingService->createBooking($data, $this->getUserId());
        return new DataResponse($booking, Http::STATUS_CREATED);
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
        return new DataResponse($this->bookingService->updateBooking($id, $data, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->bookingService->deleteBooking($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
