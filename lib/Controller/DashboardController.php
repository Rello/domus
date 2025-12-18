<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\DashboardService;
use OCA\Domus\Service\PermissionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class DashboardController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private DashboardService $dashboardService,
        private PermissionService $permissionService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function summary(?int $year = null): DataResponse {
        $year = $year ?? (int)date('Y');
        return new DataResponse($this->dashboardService->getSummary($this->getUserId(), $year, $this->getRole()));
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function getRole(): string {
        return $this->permissionService->getRoleFromRequest($this->request);
    }
}
