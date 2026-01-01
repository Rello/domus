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
            'taxRate' => $this->getTaxRate($this->getUserId()),
        ]);
    }

    #[NoAdminRequired]
    public function update(?string $taxRate = null): DataResponse {
        $taxRate = $taxRate ?? '0';
        if ($taxRate === '') {
            $taxRate = '0';
        }
        if (!is_numeric($taxRate)) {
            return $this->validationError($this->l10n->t('Enter a valid amount.'));
        }

        $normalized = (string)(float)$taxRate;
        $this->config->setUserValue($this->getUserId(), Application::APP_ID, self::CONFIG_TAX_RATE, $normalized);

        return new DataResponse([
            'taxRate' => $normalized,
        ]);
    }

    private function getTaxRate(string $userId): string {
        return $this->config->getUserValue($userId, Application::APP_ID, self::CONFIG_TAX_RATE, '0');
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
