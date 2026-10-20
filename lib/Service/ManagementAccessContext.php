<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * The actor is always a Nextcloud user. A Team is a separate data owner.
 */
class ManagementAccessContext {
    private ?array $backgroundScope = null;
    public function __construct(
        private IUserSession $userSession,
        private IRequest $request,
        private ?TeamIntegrationService $teams,
        private IL10N $l10n,
        private IGroupManager $groupManager,
        private ?IConfig $config = null,
    ) {
    }

    public function actorUserId(): string {
        if ($this->backgroundScope !== null) return $this->backgroundScope['userId'];
        $user = $this->userSession->getUser();
        if ($user === null || !$user->isEnabled()) {
            throw new \DomainException($this->l10n->t('A signed-in account is required.'));
        }
        return $user->getUID();
    }

    public function activeTeamId(): ?string {
        if ($this->backgroundScope !== null) return $this->backgroundScope['teamId'];
        $teamId = trim($this->request->getHeader('X-Domus-Team'));
        // Explicit Personal scope overrides the saved Team for this request only.
        if (strcasecmp($teamId, 'personal') === 0) {
            return null;
        }
        if ($teamId === '' && $this->config !== null) {
            $teamId = trim($this->config->getUserValue($this->actorUserId(), 'domus', 'activeTeamId', ''));
        }
        if ($teamId === '') {
            return null;
        }
        if ($this->teams === null) {
            throw new \RuntimeException($this->l10n->t('Nextcloud Teams are not available.'));
        }
        $this->teams->assertTeamAdmin($teamId);
        return $teamId;
    }

    /** Internal job scope: validate the persisted actor afresh, never alter browser preferences. */
    public function runBackground(\OCP\IUser $user, ?string $teamId, callable $operation): mixed {
        if (!$user->isEnabled() || $this->groupManager->isInGroup($user->getUID(), 'guest_app')) {
            throw new \DomainException($this->l10n->t('A staff account is required for management access.'));
        }
        $this->teams?->clearRequestCache();
        if ($teamId !== null && ($this->teams === null || !$this->teams->isTeamMember($teamId, $user->getUID()))) {
            throw new \DomainException($this->l10n->t('You do not have access to this Team.'));
        }
        $previous = $this->backgroundScope;
        $this->backgroundScope = ['userId' => $user->getUID(), 'teamId' => $teamId];
        try {
            return $operation();
        } finally {
            $this->backgroundScope = $previous;
        }
    }

    public function selectTeam(string $teamId): array {
        if ($this->config === null) {
            throw new \RuntimeException($this->l10n->t('Team selection is unavailable.'));
        }
        $this->teams?->clearRequestCache();
        if ($teamId !== '') {
            if ($this->teams === null) {
                throw new \RuntimeException($this->l10n->t('Nextcloud Teams are not available.'));
            }
            $this->teams->assertTeamAdmin($teamId);
        }
        $this->config->setUserValue($this->actorUserId(), 'domus', 'activeTeamId', $teamId);
        return $this->capabilities();
    }

    public function managementUserId(): string {
        return $this->activeTeamId() !== null ? $this->actorUserId() : $this->legacyOwnerUserId();
    }

    public function assertSubmittedTeam(?string $submittedTeamId): void {
        if ($submittedTeamId === null) {
            return;
        }
        $activeTeamId = $this->activeTeamId();
        if ($activeTeamId === null || $submittedTeamId !== $activeTeamId) {
            throw new \DomainException($this->l10n->t('The selected Team does not match this request.'));
        }
    }

    /** Personal records are available only to the signed-in staff account. */
    public function legacyOwnerUserId(): string {
        if ($this->activeTeamId() !== null) {
            throw new \DomainException($this->l10n->t('This request belongs to a Team.'));
        }
        $actor = $this->actorUserId();
        if ($this->groupManager->isInGroup($actor, 'guest_app')) {
            throw new \DomainException($this->l10n->t('A staff account is required for management access.'));
        }
        return $actor;
    }

    public function capabilities(): array {
        try {
            $teamId = $this->activeTeamId();
        } catch (\DomainException|\RuntimeException $e) {
            if ($this->config !== null && trim($this->request->getHeader('X-Domus-Team')) === '') {
                $this->config->setUserValue($this->actorUserId(), 'domus', 'activeTeamId', '');
            } else {
                throw $e;
            }
            $teamId = null;
        }
        $canManageLegacy = false;
        if ($teamId === null) {
            try {
                $this->legacyOwnerUserId();
                $canManageLegacy = true;
            } catch (\DomainException) {
                // Guest accounts have no management entitlement.
            }
        }
        return [
            'actorUserId' => $this->actorUserId(),
            'activeTeamId' => $teamId,
            'canManage' => $teamId !== null || $canManageLegacy,
            'mode' => $teamId !== null ? 'team' : ($canManageLegacy ? 'personal' : 'external'),
        ];
    }
}
