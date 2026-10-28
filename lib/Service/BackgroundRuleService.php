<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\RuleMapper;
use OCP\IUser;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

class BackgroundRuleService {
    public function __construct(private RuleMapper $mapper, private RuleService $rules,
        private ManagementAccessContext $access, private IUserManager $users, private LoggerInterface $logger) {}

    public function evaluate(): void {
        $completed = [];
        $pendingTeams = [];
        foreach ($this->mapper->backgroundOwners() as $owner) {
            $teamId = $owner['team_id'];
            $scope = $teamId !== null ? 'team:' . $teamId : 'user:' . $owner['user_id'];
            if (isset($completed[$scope])) continue;
            if ($teamId !== null) $pendingTeams[$teamId] = true;
            $user = $this->users->get($owner['user_id']);
            if ($user !== null && $this->evaluateAs($user, $teamId)) {
                $completed[$scope] = true;
                if ($teamId !== null) unset($pendingTeams[$teamId]);
            }
        }
        if ($pendingTeams === []) return;
        // Only orphaned/ineligible Team actors need discovery. Scan known accounts once,
        // checking current staff and Team membership without changing historical owners.
        $this->users->callForSeenUsers(function (IUser $user) use (&$pendingTeams): bool {
            foreach (array_keys($pendingTeams) as $teamId) {
                if ($this->evaluateAs($user, (string)$teamId)) unset($pendingTeams[$teamId]);
            }
            return $pendingTeams !== [];
        });
    }

    private function evaluateAs(IUser $user, ?string $teamId): bool {
        $authorized = false;
        try {
            $this->access->runBackground($user, $teamId, function () use ($user, &$authorized): void {
                $authorized = true;
                $this->rules->evaluate($user->getUID());
            });
        } catch (\DomainException $e) {
            if ($authorized) $this->logger->warning('Domus rule evaluation failed for an ownership context.', ['exception' => $e]);
        } catch (\Throwable $e) {
            $this->logger->warning('Domus rule evaluation failed for an ownership context.', ['exception' => $e]);
        }
        // A failed evaluation must not be retried under every other member in this run.
        return $authorized;
    }
}
