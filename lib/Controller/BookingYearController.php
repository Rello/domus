<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\BookingYearService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class BookingYearController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private BookingYearService $bookingYearService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function close(int $year): DataResponse {
        $propertyId = $this->getOptionalId('propertyId');
        $unitId = $this->getOptionalId('unitId');
        $this->bookingYearService->closeYear($year, $propertyId, $unitId, $this->getUserId());

        return new DataResponse([
            'year' => $year,
            'closed' => true,
        ]);
    }

    #[NoAdminRequired]
    public function reopen(int $year): DataResponse {
        $propertyId = $this->getOptionalId('propertyId');
        $unitId = $this->getOptionalId('unitId');
        $this->bookingYearService->reopenYear($year, $propertyId, $unitId, $this->getUserId());

        return new DataResponse([
            'year' => $year,
            'closed' => false,
        ]);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }

    private function getOptionalId(string $key): ?int {
        $value = $this->request->getParam($key);
        if ($value === null || $value === '') {
            return null;
        }
        return (int)$value;
    }
}
