<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;
use OCA\Domus\Service\DemoContentService;
use OCA\Domus\Service\PermissionService;

class SettingsController extends Controller {
    private const CONFIG_TAX_RATE = 'taxRate';

    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private IConfig $config,
        private DemoContentService $demoContentService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function show(): DataResponse {
        return new DataResponse([
            'settings' => $this->getSettings($this->getUserId()),
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
                return $this->validationError($this->l10n->t('Enter a valid amount.'));
            }

            $this->config->setUserValue($userId, Application::APP_ID, $key, $normalized);
            $updated[$key] = $normalized;
        }

        return new DataResponse([
            'settings' => $this->getSettings($userId),
            'updated' => $updated,
        ]);
    }

    #[NoAdminRequired]
    public function createDemoContent(): DataResponse {
        $role = $this->permissionService->getRoleFromRequest($this->request);
        try {
            $data = $this->demoContentService->createDemoContent($this->getUserId(), $role);
            return new DataResponse([
                'status' => 'success',
                'data' => $data,
            ], Http::STATUS_CREATED);
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $this->l10n->t('An error occurred'),
                'code' => 'ERROR',
            ], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    private function getSettingsDefinition(): array {
        return [
            self::CONFIG_TAX_RATE => [
                'default' => '0',
            ],
        ];
    }

    private function getSettings(string $userId): array {
        $settings = [];
        foreach ($this->getSettingsDefinition() as $key => $definition) {
            $value = $this->config->getUserValue(
                $userId,
                Application::APP_ID,
                $key,
                $definition['default'] ?? '',
            );
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

        return null;
    }

    private function formatSettingValue(string $key, string $value): string {
        if ($key === self::CONFIG_TAX_RATE) {
            if (!is_numeric($value)) {
                return '0';
            }
            return (string)((float)$value * 100);
        }

        return $value;
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function validationError(string $message): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => 'VALIDATION_ERROR',
        ], Http::STATUS_BAD_REQUEST);
    }
}
