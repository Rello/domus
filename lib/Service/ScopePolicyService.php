<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUserSession;

/** Server-wide portfolio policy. Store both controls atomically in one config value. */
class ScopePolicyService {
    public function __construct(
        private IAppConfig $config,
        private IGroupManager $groups,
        private IUserSession $session,
        private IL10N $l10n,
    ) {
    }

    public function policy(): array {
        $value = $this->config->getValueString('domus', 'scopePolicy', '');
        // Preserve existing installations until an administrator configures an explicit list.
        if ($value === '') return ['allowPersonal' => true, 'enabledTeamIds' => null];
        $policy = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($policy) || !is_bool($policy['allowPersonal'] ?? null)
            || !is_array($policy['enabledTeamIds'] ?? null)) {
            throw new \RuntimeException($this->l10n->t('Invalid Domus access policy.'));
        }
        return $policy;
    }

    public function allowsPersonal(): bool {
        return $this->policy()['allowPersonal'];
    }

    public function allowsTeam(string $teamId): bool {
        $ids = $this->policy()['enabledTeamIds'];
        return $ids === null || in_array($teamId, $ids, true);
    }

    public function assertPersonalAllowed(): void {
        if (!$this->allowsPersonal()) {
            throw new \DomainException($this->l10n->t('Personal portfolios are disabled by your Nextcloud administrator.'));
        }
    }

    public function isAdmin(): bool {
        $user = $this->session->getUser();
        return $user !== null && $user->isEnabled() && $this->groups->isAdmin($user->getUID());
    }

    private function assertAdmin(): void {
        if (!$this->isAdmin()) throw new \DomainException($this->l10n->t('Only Nextcloud administrators can change Domus access settings.'));
    }

    /** Optional Teams-app adapter, matching its administration listing. Never used for portfolio access. */
    protected function allTeams(): array {
        if (!class_exists(\OCA\Circles\Service\CircleService::class)) return [];
        $uid = $this->session->getUser()->getUID();
        $users = \OCP\Server::get(\OCA\Circles\Service\FederatedUserService::class);
        $users->setCurrentPatron($uid);
        $users->setLocalCurrentUserId($uid);
        $probe = new \OCA\Circles\Model\Probes\CircleProbe();
        $probe->filterPersonalCircles()->filterSingleCircles()->filterSystemCircles()
            ->filterHiddenCircles()->filterBackendCircles();
        $service = \OCP\Server::get(\OCA\Circles\Service\CircleService::class);
        // NC34 lacks getAllCircles; use the same unscoped query as the newer service.
        $circles = method_exists($service, 'getAllCircles') ? $service->getAllCircles($probe)
            : \OCP\Server::get(\OCA\Circles\Db\CircleRequest::class)->getCircles(null, $probe);
        $teams = array_map(static fn ($circle): array => [
            'teamId' => $circle->getSingleId(), 'displayName' => $circle->getDisplayName(),
        ], $circles);
        usort($teams, static fn ($a, $b): int => strnatcasecmp($a['displayName'], $b['displayName']));
        return $teams;
    }

    public function adminSettings(): array {
        $this->assertAdmin();
        return $this->policy() + ['teams' => $this->allTeams()];
    }

    public function save(bool $allowPersonal, array $enabledTeamIds): array {
        $this->assertAdmin();
        $known = array_column($this->allTeams(), 'teamId');
        foreach ($enabledTeamIds as $id) {
            if (!is_string($id) || !in_array($id, $known, true)) {
                throw new \InvalidArgumentException($this->l10n->t('Select a valid Team.'));
            }
        }
        $policy = ['allowPersonal' => $allowPersonal, 'enabledTeamIds' => array_values(array_unique($enabledTeamIds))];
        $this->config->setValueString('domus', 'scopePolicy', json_encode($policy, JSON_THROW_ON_ERROR));
        return $policy;
    }
}
