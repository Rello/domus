<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\AccountService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;

class AccountController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private AccountService $accountService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->accountService->getHierarchyForUser($this->getUserId(), $this->l10n));
    }

    #[NoAdminRequired]
    public function create(string $number, ?string $labelDe = null, ?string $labelEn = null, ?int $parentId = null, ?int $sortOrder = null): DataResponse {
        $data = compact('number', 'labelDe', 'labelEn', 'parentId', 'sortOrder');
        $account = $this->accountService->createAccount($data);
        return new DataResponse($account, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $number = null, ?string $labelDe = null, ?string $labelEn = null, ?int $parentId = null, ?int $sortOrder = null): DataResponse {
        $data = array_filter([
            'number' => $number,
            'labelDe' => $labelDe,
            'labelEn' => $labelEn,
            'parentId' => $parentId,
            'sortOrder' => $sortOrder,
        ], fn($value) => $value !== null);
        return new DataResponse($this->accountService->updateAccount($id, $data));
    }

    #[NoAdminRequired]
    public function disable(int $id): DataResponse {
        return new DataResponse($this->accountService->setStatus($id, 'disabled', $this->getUserId()));
    }

    #[NoAdminRequired]
    public function enable(int $id): DataResponse {
        return new DataResponse($this->accountService->setStatus($id, 'active', $this->getUserId()));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->accountService->deleteAccount($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
