<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCP\App\IAppManager;
use OCP\Group\ISubAdmin;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Teams\ITeamManager;

class TeamIntegrationService {
    private const GUEST_GROUP_ID = 'guest_app';

    /** Request-local membership snapshots, never shared between requests. */
    private array $teamsByUser = [];

    public function __construct(
        private ITeamManager $teamManager,
        private IUserSession $userSession,
        private IGroupManager $groupManager,
        private ISubAdmin $subAdmin,
        private IAppManager $appManager,
        private IAppConfig $appConfig,
        private IL10N $l10n,
    ) {
    }

    public function listTeams(): array {
        $user = $this->getStaffUser();
        $this->assertTeamsAvailable();

        return array_map(static fn ($team): array => [
            'teamId' => $team->getId(),
            'displayName' => $team->getDisplayName(),
            'role' => 'admin',
        ], $this->teamsForUser($user->getUID()));
    }

    public function assertTeamAdmin(string $teamId): void {
        if ($teamId === '') {
            throw new \DomainException($this->l10n->t('Select a Team.'));
        }

        foreach ($this->listTeams() as $team) {
            if ($team['teamId'] === $teamId) {
                return;
            }
        }

        throw new \DomainException($this->l10n->t('You do not have access to this Team.'));
    }

    /** Used to recheck the staff account supplying an authenticated renter document. */
    public function isTeamMember(string $teamId, string $uid): bool {
        $this->assertTeamsAvailable();
        if ($this->groupManager->isInGroup($uid, self::GUEST_GROUP_ID)) return false;
        foreach ($this->teamsForUser($uid) as $team) {
            if ($team->getId() === $teamId) return true;
        }
        return false;
    }

    public function getTeamFolder(string $teamId): ?array {
        $this->assertTeamAdmin($teamId);
        if (!method_exists($this->teamManager, 'getTeamFolderProvider')) {
            return null;
        }

        $provider = $this->teamManager->getTeamFolderProvider();
        $folder = $provider?->getTeamFolder($teamId);
        return $folder?->jsonSerialize();
    }

    public function getGuestCreationContext(string $teamId): array {
        $this->assertTeamAdmin($teamId);
        $user = $this->getStaffUser();

        $reason = null;
        if (!$this->appManager->isEnabledForUser('guests', $user)) {
            $reason = $this->l10n->t('The Guests app is not enabled for your account.');
        } elseif ($this->appConfig->getValueBool('core', 'shareapi_only_share_with_group_members', false)) {
            $reason = $this->l10n->t('Guest invitations require sharing outside your groups. Contact your Nextcloud administrator.');
        } elseif (!$this->canInviteGuests($user)) {
            $reason = $this->l10n->t('Your account is not allowed to invite guests.');
        } elseif ($this->appConfig->getValueBool('guests', 'usewhitelist', true)
            && !in_array('domus', $this->getGuestAllowlist(), true)) {
            $reason = $this->l10n->t('Domus must be allowed for guest accounts. Contact your Nextcloud administrator.');
        }

        return [
            'teamId' => $teamId,
            'canCreate' => $reason === null,
            'message' => $reason,
        ];
    }

    public function clearRequestCache(): void {
        $this->teamsByUser = [];
    }

    private function teamsForUser(string $uid): array {
        return $this->teamsByUser[$uid] ??= $this->teamManager->getTeamsForUser($uid);
    }

    private function canInviteGuests(IUser $user): bool {
        if ($this->groupManager->isAdmin($user->getUID()) || $this->subAdmin->isSubAdmin($user)) {
            return true;
        }

        $restrictedGroups = $this->appConfig->getValueArray('guests', 'create_restricted_to_group', []);
        return $restrictedGroups === []
            || array_intersect($this->groupManager->getUserGroupIds($user), $restrictedGroups) !== [];
    }

    private function getGuestAllowlist(): array {
        $whitelist = $this->appConfig->getValueString('guests', 'whitelist', '');
        return array_map('trim', explode(',', $whitelist));
    }

    private function getStaffUser(): IUser {
        $user = $this->userSession->getUser();
        if ($user === null || !$user->isEnabled()
            || $this->groupManager->isInGroup($user->getUID(), self::GUEST_GROUP_ID)) {
            throw new \DomainException($this->l10n->t('A staff account is required to access management Teams.'));
        }

        return $user;
    }

    private function assertTeamsAvailable(): void {
        if (!method_exists($this->teamManager, 'hasTeamSupport')
            || !method_exists($this->teamManager, 'getTeamsForUser')
            || !$this->teamManager->hasTeamSupport()) {
            throw new \RuntimeException($this->l10n->t('Nextcloud Teams are not available.'));
        }
    }
}
