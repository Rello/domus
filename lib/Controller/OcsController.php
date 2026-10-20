<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\PortfolioSettingsService;
use OCA\Domus\Service\StatisticsService;
use OCA\Domus\Service\UnitService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController as BaseOCSController;
use OCP\IRequest;

/** Read-only external access to existing unit data and financial calculations. */
class OcsController extends BaseOCSController {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private UnitService $unitService,
        private StatisticsService $statisticsService,
        private PermissionService $permissionService,
        private PortfolioSettingsService $portfolioSettings,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function units(): DataResponse {
        $userId = $this->managementContext->managementUserId();
        $units = $this->unitService->listUnitsForUser(
            $userId, null, $this->permissionService->getRoleFromRequest($this->request),
        );
        return $this->respond(array_map(static fn(Unit $unit): array => [
            'id' => $unit->getId(),
            'propertyId' => $unit->getPropertyId(),
            'label' => $unit->getLabel(),
            'street' => $unit->getStreet(),
            'zip' => $unit->getZip(),
            'city' => $unit->getCity(),
            'country' => $unit->getCountry(),
            'unitNumber' => $unit->getUnitNumber(),
            'unitType' => $unit->getUnitType(),
            'livingArea' => $unit->getLivingArea(),
            'buyDate' => $unit->getBuyDate(),
            'totalCosts' => $unit->getTotalCosts(),
        ], $units));
    }

    #[NoAdminRequired]
    public function revenue(int $id): DataResponse {
        $userId = $this->managementContext->managementUserId();
        // This service loads the unit through the existing ownership-scoped mapper.
        $statistics = $this->statisticsService->unitStatsAllYears($id, $userId);
        $taxRate = $this->portfolioSettings->getValue($userId, 'taxRate', '0');
        return $this->respond([
            'unitId' => $id,
            'taxRate' => is_numeric($taxRate) ? (float)$taxRate : 0.0,
            'columns' => $statistics['revenue']['columns'],
            'rows' => $statistics['revenue']['rows'],
        ]);
    }

    private function respond(array $data): DataResponse {
        $response = new DataResponse($data);
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
}
