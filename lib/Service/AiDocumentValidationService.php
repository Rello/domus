<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\App\IAppManager;
use OCP\TaskProcessing\IManager;
use OCP\TaskProcessing\TaskTypes\TextToTextChat;

class AiDocumentValidationService {
    public const SETTING = 'aiDocumentValidation';

    public function __construct(private IAppManager $apps, private ManagementAccessContext $access,
        private PortfolioSettingsService $settings) {}

    protected function manager(): IManager { return \OCP\Server::get(IManager::class); }

    public function status(): array {
        $assistant = $this->apps->isEnabledForUser('assistant');
        $processing = false;
        $provider = false;
        try {
            $manager = $this->manager();
            $processing = true;
            $provider = in_array(TextToTextChat::ID, $manager->getAvailableTaskTypeIds(false, $this->access->actorUserId()), true);
        } catch (\Throwable) {
            // Optional AI infrastructure must not break ordinary document workflows.
        }
        $enabled = $this->settings->getValue($this->access->managementUserId(), self::SETTING, '0') === '1';
        return ['assistant' => $assistant, 'taskProcessing' => $processing, 'chatProvider' => $provider,
            'available' => $assistant && $processing && $provider, 'enabled' => $enabled];
    }
}
