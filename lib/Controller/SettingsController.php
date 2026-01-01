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

class SettingsController extends Controller {
    private const CONFIG_TAX_RATE = 'taxRate';

    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private IConfig $config,
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
            $settings[$key] = $this->config->getUserValue(
                $userId,
                Application::APP_ID,
                $key,
                $definition['default'] ?? '',
            );
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
            return (string)(float)$normalized;
        }

        return null;
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
