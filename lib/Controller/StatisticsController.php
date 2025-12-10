<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\StatisticsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class StatisticsController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private StatisticsService $statisticsService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function unit(int $unitId): DataResponse {
        $stats = $this->statisticsService->unitStatsAllYears($unitId, $this->getUserId());

        return new DataResponse($stats);
    }

    #[NoAdminRequired]
    public function unitPerYear(int $unitId, int $year): DataResponse {
        $stats = $this->statisticsService->unitStatPerYear($unitId, $this->getUserId(), $year);

        return new DataResponse($stats);
    }

    #[NoAdminRequired]
    public function unitsOverview(?int $year = null, ?int $propertyId = null): DataResponse {
        $year = $year ?? (int)date('Y');
        $stats = $this->statisticsService->unitOverview($year, $this->getUserId(), $propertyId);

        return new DataResponse($stats);
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }
}
