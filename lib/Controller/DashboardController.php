<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\DashboardService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class DashboardController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private DashboardService $dashboardService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function summary(int $year): DataResponse {
        return new DataResponse($this->dashboardService->summary($this->getCurrentUserId(), $year));
    }
}
