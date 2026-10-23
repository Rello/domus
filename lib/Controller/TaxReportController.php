<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\{ManagementAccessContext, PermissionService, TaxReportService};
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class TaxReportController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private PermissionService $permissionService,
        private TaxReportService $taxReportService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function show(int $year): DataResponse {
        return new DataResponse($this->taxReportService->report(
            $this->managementContext->managementUserId(), $year, $this->permissionService->getRoleFromRequest($this->request),
        ));
    }
}
