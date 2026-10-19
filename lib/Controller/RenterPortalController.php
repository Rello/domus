<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\Http\FileResponse;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Http\ApiErrorResponse;
use OCA\Domus\Service\RenterPortalService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class RenterPortalController extends Controller {
    public function __construct(IRequest $request, private RenterPortalService $service, private IL10N $l10n, private LoggerInterface $logger) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function detail(string $teamId, int $tenancyId): DataResponse {
        return $this->respond(fn () => $this->service->detail($teamId, $tenancyId));
    }

    #[NoAdminRequired]
    public function preview(string $teamId, int $tenancyId, int $partnerId): DataResponse {
        return $this->respond(fn () => $this->service->preview($teamId, $tenancyId, $partnerId));
    }

    #[NoAdminRequired]
    public function documents(string $teamId, int $tenancyId): DataResponse {
        return $this->respond(fn () => $this->service->documents($teamId, $tenancyId));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function content(int $id): FileDisplayResponse|DataResponse {
        try {
            return FileResponse::document($this->service->content($id));
        } catch (\Throwable $exception) {
            return ApiErrorResponse::fromException($exception, $this->l10n, $this->logger);
        }
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function previewContent(string $teamId, int $tenancyId, int $id): FileDisplayResponse|DataResponse {
        try {
            return FileResponse::document($this->service->previewContent($teamId, $tenancyId, $id));
        } catch (\Throwable $exception) {
            return ApiErrorResponse::fromException($exception, $this->l10n, $this->logger);
        }
    }

    #[NoAdminRequired]
    public function requestCorrection(string $teamId, int $partnerId, array $proposed): DataResponse {
        return $this->respond(fn () => $this->service->requestCorrection($teamId, $partnerId, $proposed));
    }

    #[NoAdminRequired]
    public function corrections(string $teamId, int $partnerId): DataResponse {
        return $this->respond(fn () => $this->service->corrections($teamId, $partnerId));
    }

    #[NoAdminRequired]
    public function decide(string $teamId, int $id, bool $approve): DataResponse {
        return $this->respond(fn () => $this->service->decide($teamId, $id, $approve));
    }

    private function respond(callable $action): DataResponse {
        try {
            $response = new DataResponse($action());
        } catch (\Throwable $exception) {
            $response = ApiErrorResponse::fromException($exception, $this->l10n, $this->logger);
        }
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
}
