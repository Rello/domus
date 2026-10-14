<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Http\ApiErrorResponse;
use OCA\Domus\Service\TeamIntegrationService;
use OCA\Domus\Service\ManagementAccessContext;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class TeamIntegrationController extends Controller {
    public function __construct(
        IRequest $request,
        private TeamIntegrationService $integrationService,
        private ManagementAccessContext $managementContext,
        private LoggerInterface $logger,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return $this->respond(fn (): array => ['teams' => $this->integrationService->listTeams()]);
    }

    #[NoAdminRequired]
    public function folder(string $teamId): DataResponse {
        return $this->respond(fn (): array => ['folder' => $this->integrationService->getTeamFolder($teamId)]);
    }

    #[NoAdminRequired]
    public function guestCreation(string $teamId): DataResponse {
        return $this->respond(fn (): array => $this->integrationService->getGuestCreationContext($teamId));
    }

    #[NoAdminRequired]
    public function activate(string $teamId): DataResponse {
        return $this->respond(fn (): array => ['managementContext' => $this->managementContext->selectTeam($teamId)]);
    }

    #[NoAdminRequired]
    public function deactivate(): DataResponse {
        return $this->respond(fn (): array => ['managementContext' => $this->managementContext->selectTeam('')]);
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
