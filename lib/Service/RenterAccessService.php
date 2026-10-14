<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\RenterAccessMapper;
use OCP\IL10N;
use OCP\IUserManager;

/** The partner's Nextcloud user ID is the sole renter access assignment. */
class RenterAccessService {
    public function __construct(
        private RenterAccessMapper $mapper,
        private ManagementAccessContext $access,
        private TeamIntegrationService $teams,
        private IUserManager $users,
        private IL10N $l10n,
    ) {
    }

    private function managementPartner(int $partnerId, string $teamId): array {
        $this->access->assertSubmittedTeam($teamId);
        $this->teams->assertTeamAdmin($teamId);
        $partner = $this->mapper->partner($teamId, $partnerId);
        if ($partner === null) {
            throw new \DomainException($this->l10n->t('This tenant is not available in the selected Team.'));
        }
        return $partner;
    }

    public function status(int $partnerId, string $teamId): array {
        $partner = $this->managementPartner($partnerId, $teamId);
        $uid = $partner['nc_user_id'] ?? '';
        $user = $uid !== '' ? $this->users->get($uid) : null;
        if ($uid !== '' && $user === null) {
            $this->mapper->unlinkDeletedUser($uid);
            $uid = '';
        }
        return ['ncUserId' => $uid, 'accountEnabled' => $user?->isEnabled()];
    }

    /** Link an explicit account, or find/create a guest using the contact's email. */
    public function link(int $partnerId, string $teamId, ?string $ncUserId = null): array {
        $partner = $this->managementPartner($partnerId, $teamId);
        if (!empty($partner['nc_user_id'])) {
            $status = $this->status($partnerId, $teamId);
            if ($status['ncUserId'] !== '') {
                return $status;
            }
        }
        if ($ncUserId !== null) {
            $user = $this->users->get(trim($ncUserId));
            if ($user === null) {
                throw new \InvalidArgumentException($this->l10n->t('Nextcloud account not found.'));
            }
        } else {
            $email = trim($partner['email'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new \InvalidArgumentException($this->l10n->t('Add a valid email address to this contact first.'));
            }
            $matches = array_values($this->users->getByEmail($email));
            if (count($matches) > 1) {
                throw new \InvalidArgumentException($this->l10n->t('Several accounts use this email. Enter the Nextcloud user ID to link the intended account.'));
            }
            $user = $matches[0] ?? null;
            if ($user === null) {
                $readiness = $this->teams->getGuestCreationContext($teamId);
                if (!$readiness['canCreate']) {
                    throw new \DomainException($readiness['message']);
                }
                return ['needsGuest' => true, 'email' => $email, 'displayName' => $partner['name']];
            }
        }
        // Use the directory's canonical UID, including the UID returned by Guests.
        $this->mapper->linkUser($teamId, $partnerId, $user->getUID());
        return $this->status($partnerId, $teamId);
    }

    /** No Team header, role flag or invitation state can broaden this result. */
    public function identity(): array {
        $uid = $this->access->actorUserId();
        $partners = [];
        $tenancies = [];
        foreach ($this->mapper->partnersForUser($uid) as $partner) {
            $contact = ['id' => (int)$partner['id'], 'teamId' => $partner['team_id'], 'name' => $partner['name']];
            foreach (['email', 'phone', 'street', 'zip', 'city', 'country'] as $field) {
                $contact[$field] = $partner[$field] ?? null;
            }
            $partners[] = $contact;
            foreach ($this->mapper->linkedTenancies($partner['team_id'], (int)$partner['id']) as $tenancy) {
                $tenancies[$partner['team_id'] . ':' . $tenancy['id']] = ['teamId' => $partner['team_id']] + $tenancy;
            }
        }
        return ['ncUserId' => $uid, 'canAccessTenancies' => $tenancies !== [],
            'partners' => $partners, 'tenancies' => array_values($tenancies)];
    }
}
