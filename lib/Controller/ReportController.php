<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\ReportService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class ReportController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private ReportService $reportService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?int $propertyId = null, ?int $year = null): DataResponse {
        return new DataResponse($this->reportService->listReports($this->getUserId(), $propertyId, $year));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            return new DataResponse($this->reportService->getReportForUser($id, $this->getUserId()));
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function listForPropertyYear(int $propertyId, int $year): DataResponse {
        return $this->index($propertyId, $year);
    }

    #[NoAdminRequired]
    public function generateForPropertyYear(int $propertyId, int $year): DataResponse {
        try {
            $report = $this->reportService->generatePropertyReport($propertyId, $year, $this->getUserId());
            return new DataResponse($report, Http::STATUS_CREATED);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function download(int $id): DataResponse {
        try {
            $report = $this->reportService->getReportForUser($id, $this->getUserId());
            return new DataResponse(['downloadUrl' => $report->getDownloadUrl()]);
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
}
