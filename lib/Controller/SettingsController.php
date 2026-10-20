<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\PortfolioSettingsService;
use OCA\Domus\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;
use OCA\Domus\Service\DemoContentService;
use OCA\Domus\Service\PermissionService;
use OCP\IGroupManager;

class SettingsController extends Controller {
    private const CONFIG_TAX_RATE = 'taxRate';
    private const CONFIG_WIZARD = 'wizard';

    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private ManagementAccessContext $managementContext,
        private DemoContentService $demoContentService,
        private PermissionService $permissionService,
        private IL10N $l10n,
        private IGroupManager $groupManager,
        private PortfolioSettingsService $portfolioSettings,
        private IAppManager $appManager,
        private \OCA\Domus\Service\DocumentTemplateService $documentTemplates,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function show(): DataResponse {
        return new DataResponse([
            'settings' => $this->getSettings($this->getUserId()),
            'utilityReportTemplate' => $this->documentTemplates->status($this->getUserId()),
            'requiredApps' => [
                'circles' => $this->appManager->isEnabledForUser('circles', $this->userSession->getUser()),
                'groupfolders' => $this->appManager->isEnabledForUser('groupfolders', $this->userSession->getUser()),
                'guests' => $this->appManager->isEnabledForUser('guests', $this->userSession->getUser()),
            ],
        ]);
    }

    #[NoAdminRequired]
    public function update(): DataResponse {
        $userId = $this->getUserId();
        $definitions = $this->getSettingsDefinition();
        $params = $this->request->getParams();
        $updated = [];

        foreach ($definitions as $key => $definition) {
            if (!array_key_exists($key, $params)) {
                continue;
            }

            $normalized = $this->normalizeSettingValue($key, $params[$key]);
            if ($normalized === null) {
                throw new \InvalidArgumentException($this->l10n->t('Enter a valid amount.'));
            }

            $this->portfolioSettings->setValue($userId, $key, $normalized);
            $updated[$key] = $normalized;
        }

        return new DataResponse([
            'settings' => $this->getSettings($userId),
            'updated' => $updated,
        ]);
    }

    #[NoAdminRequired]
    public function templateStatus(): DataResponse {
        return new DataResponse($this->documentTemplates->status($this->getUserId()));
    }

    #[NoAdminRequired]
    public function assignTemplate(string $path = ''): DataResponse {
        $this->documentTemplates->assign($this->getUserId(), $path);
        return $this->templateStatus();
    }

    #[NoAdminRequired]
    public function createDemoContent(): DataResponse {
        $actor = $this->userSession->getUser();
        if ($actor === null || !$actor->isEnabled() || $this->groupManager->isInGroup($actor->getUID(), 'guest_app')) {
            throw new \DomainException($this->l10n->t('A staff account is required for management access.'));
        }
        $role = $this->permissionService->getRoleFromRequest($this->request);
        $data = $this->demoContentService->createDemoContent($this->managementContext->legacyOwnerUserId(), $role);
        return new DataResponse([
            'status' => 'success',
            'data' => $data,
        ], Http::STATUS_CREATED);
    }

    private function getSettingsDefinition(): array {
        return [
            self::CONFIG_TAX_RATE => [
                'default' => '0',
            ],
            self::CONFIG_WIZARD => [
                'default' => '0',
            ],
        ];
    }

    private function getSettings(string $userId): array {
        $settings = [];
        foreach ($this->getSettingsDefinition() as $key => $definition) {
            $value = $this->portfolioSettings->getValue($userId, $key, $definition['default'] ?? '');
            $settings[$key] = $this->formatSettingValue($key, $value);
        }

        return $settings;
    }

    private function normalizeSettingValue(string $key, mixed $value): ?string {
        if ($key === self::CONFIG_TAX_RATE) {
            $normalized = $value === null ? '' : trim((string)$value);
            if ($normalized === '') {
                $normalized = '0';
            }
            if (!is_numeric($normalized)) {
                return null;
            }
            $percentage = (float)$normalized;
            return (string)($percentage / 100);
        }

        if ($key === self::CONFIG_WIZARD) {
            $normalized = $value === null ? '' : trim((string)$value);
            if ($normalized === '') {
                return '0';
            }
            if ($normalized === '1' || strtolower($normalized) === 'true') {
                return '1';
            }
            if ($normalized === '0' || strtolower($normalized) === 'false') {
                return '0';
            }
            return null;
        }

        return null;
    }

    private function formatSettingValue(string $key, string $value): string {
        if ($key === self::CONFIG_TAX_RATE) {
            if (!is_numeric($value)) {
                return '0';
            }
            return (string)((float)$value * 100);
        }

        if ($key === self::CONFIG_WIZARD) {
            return ($value === '1') ? '1' : '0';
        }

        return $value;
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}
