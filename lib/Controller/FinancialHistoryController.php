<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\FinancialHistoryService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class FinancialHistoryController extends Controller {
    public function __construct(IRequest $request, private FinancialHistoryService $history) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function preview(int $year, ?int $unitId = null, ?int $propertyId = null): DataResponse {
        return $this->response($this->history->preview($year, $unitId, $propertyId));
    }

    #[NoAdminRequired]
    public function remove(int $year, string $token, ?int $unitId = null, ?int $propertyId = null): DataResponse {
        return $this->response($this->history->remove($year, $unitId, $propertyId, $token));
    }

    private function response(array $data): DataResponse {
        $response = new DataResponse($data);
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
}
