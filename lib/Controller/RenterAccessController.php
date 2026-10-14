<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Http\ApiErrorResponse;
use OCA\Domus\Service\RenterAccessService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class RenterAccessController extends Controller {
    public function __construct(IRequest $request, private RenterAccessService $service,
        private IL10N $l10n, private LoggerInterface $logger) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function status(int $partnerId, string $teamId): DataResponse {
        return $this->respond(fn () => $this->service->status($partnerId, $teamId));
    }

    #[NoAdminRequired]
    public function link(int $partnerId, string $teamId, ?string $ncUserId = null): DataResponse {
        return $this->respond(fn () => $this->service->link($partnerId, $teamId, $ncUserId));
    }

    #[NoAdminRequired]
    public function identity(): DataResponse {
        return $this->respond(fn () => $this->service->identity());
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
