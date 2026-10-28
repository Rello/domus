<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\UnitMoveService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
use Psr\Log\LoggerInterface;
use OCA\Domus\Http\ApiErrorResponse;

class UnitMoveController extends Controller {
    public function __construct(IRequest $request, private UnitMoveService $moves, private IL10N $l10n, private LoggerInterface $logger) {
        parent::__construct(Application::APP_ID, $request);
    }
    private function respond(callable $operation): DataResponse {
        try {
            $response = new DataResponse($operation());
        } catch (\Throwable $e) {
            $response = ApiErrorResponse::fromException($e, $this->l10n, $this->logger);
        }
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
    #[NoAdminRequired]
    public function status(int $id): DataResponse { return $this->respond(fn() => $this->moves->status($id)); }
    #[NoAdminRequired]
    public function preview(int $id, string $teamId): DataResponse { return $this->respond(fn() => $this->moves->preview($id, $teamId)); }
    #[NoAdminRequired]
    public function start(int $id, string $teamId, string $token): DataResponse { return $this->respond(fn() => $this->moves->start($id, $teamId, $token)); }
    #[NoAdminRequired]
    public function advance(int $id): DataResponse { return $this->respond(fn() => $this->moves->advance($id)); }
    #[NoAdminRequired]
    public function cancel(int $id): DataResponse { return $this->respond(fn() => $this->moves->cancel($id)); }
}
