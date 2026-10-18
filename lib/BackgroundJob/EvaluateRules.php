<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\BackgroundJob;

use OCA\Domus\Db\RuleMapper;
use OCA\Domus\Service\{ManagementAccessContext, RuleService};
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

class EvaluateRules extends TimedJob {
    public function __construct(ITimeFactory $time, private RuleMapper $mapper, private RuleService $rules,
        private ManagementAccessContext $access, private IUserManager $users, private LoggerInterface $logger) {
        parent::__construct($time);
        $this->setInterval(300);
    }

    protected function run($argument): void {
        $completedScopes = [];
        foreach ($this->mapper->backgroundOwners() as $owner) {
            $scope = $owner['team_id'] !== null ? 'team:' . $owner['team_id'] : 'user:' . $owner['user_id'];
            if (isset($completedScopes[$scope])) continue;
            try {
                $user = $this->users->get($owner['user_id']);
                if (!$user) continue;
                $this->access->runBackground($user, $owner['team_id'], fn() => $this->rules->evaluate($user->getUID()));
                $completedScopes[$scope] = true;
            } catch (\Throwable $e) {
                $this->logger->warning('Domus rule evaluation failed for an ownership context.', ['exception' => $e]);
            }
        }
    }
}
