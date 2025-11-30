<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ReportService;
use OCP\AppFramework\Attributes\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class ReportController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private ReportService $reportService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->reportService->list($this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $report = $this->reportService->getById($id, $this->getCurrentUserId());
            return new DataResponse($report);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function byPropertyYear(int $propertyId, int $year): DataResponse {
        return new DataResponse($this->reportService->listForPropertyYear($propertyId, $year, $this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function createForPropertyYear(int $propertyId, int $year): DataResponse {
        $report = $this->reportService->createForPropertyYear($propertyId, $year, $this->getCurrentUserId());
        return new DataResponse($report, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function download(int $id): DataResponse {
        try {
            $report = $this->reportService->getById($id, $this->getCurrentUserId());
            return new DataResponse([
                'filePath' => $report->getFilePath(),
            ]);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
