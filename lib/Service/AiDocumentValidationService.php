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
        private PortfolioSettingsService $settings, private BookingAssignmentPdfParser $pdfParser) {}

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
        // Assistant can be enabled while its bundled PDF parser is missing or changed.
        $pdfParser = $assistant && $this->pdfParser->isAvailable();
        $enabled = $this->settings->getValue($this->access->managementUserId(), self::SETTING, '0') === '1';
        return ['assistant' => $assistant, 'pdfParser' => $pdfParser, 'taskProcessing' => $processing, 'chatProvider' => $provider,
            'available' => $pdfParser && $processing && $provider, 'enabled' => $enabled];
    }
}
