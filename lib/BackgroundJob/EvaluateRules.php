<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\BackgroundJob;

use OCA\Domus\Service\BackgroundRuleService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;

class EvaluateRules extends TimedJob {
    public function __construct(ITimeFactory $time, private BackgroundRuleService $rules) {
        parent::__construct($time);
        $this->setInterval(300);
    }

    protected function run($argument): void {
        $this->rules->evaluate();
    }
}
