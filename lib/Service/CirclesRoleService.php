<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Optional Teams-app adapter shared by NC34 and NC35. No session elevation or role cache. */
class CirclesRoleService {
    protected function manager(): object {
        return \OCP\Server::get(\OCA\Circles\CirclesManager::class);
    }

    public function role(string $teamId, string $uid): string {
        $manager = $this->manager();
        $user = $manager->getLocalFederatedUser($uid);
        $membership = $manager->getLink($teamId, $user->getSingleId());
        return match ($membership->getLevel()) {
            \OCA\Circles\Model\Member::LEVEL_OWNER, \OCA\Circles\Model\Member::LEVEL_ADMIN => 'admin',
            \OCA\Circles\Model\Member::LEVEL_MEMBER, \OCA\Circles\Model\Member::LEVEL_MODERATOR => 'member',
            default => 'none',
        };
    }
}
