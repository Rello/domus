<?php
// SPDX-FileCopyrightText: 2026 Marcel Scherello
// SPDX-License-Identifier: AGPL-3.0-or-later
define('OC_CONSOLE', true);
require '/var/www/html/lib/base.php';
require_once __DIR__ . '/../lib/Service/CirclesRoleService.php';
use OCA\Circles\Model\Member;
$users = \OCP\Server::get(\OCP\IUserManager::class);
$manager = \OCP\Server::get(\OCA\Circles\CirclesManager::class);
$prefix = 'domus-role-test-' . bin2hex(random_bytes(4));
$createdUsers = [];
$circles = [];
$failure = null;
$group = null;
$roles = new \OCA\Domus\Service\CirclesRoleService();
$teams = new \OCA\Domus\Service\TeamIntegrationService(
    \OCP\Server::get(\OCP\Teams\ITeamManager::class),
    \OCP\Server::get(\OCP\IUserSession::class),
    \OCP\Server::get(\OCP\IGroupManager::class),
    \OCP\Server::get(\OCP\Group\ISubAdmin::class),
    \OCP\Server::get(\OCP\App\IAppManager::class),
    \OCP\Server::get(\OCP\IAppConfig::class),
    \OCP\Server::get(\OCP\L10N\IFactory::class)->get('domus'),
    null, $roles,
);
$access = new \OCA\Domus\Service\ManagementAccessContext(
    \OCP\Server::get(\OCP\IUserSession::class),
    \OCP\Server::get(\OCP\IRequest::class), $teams,
    \OCP\Server::get(\OCP\L10N\IFactory::class)->get('domus'),
    \OCP\Server::get(\OCP\IGroupManager::class),
);
function checkRole($roles, $circle, $uid, $expected, $label) {
    $actual = $roles->role($circle->getSingleId(), $uid);
    if ($actual !== $expected) throw new RuntimeException("$label: expected $expected got $actual");
    global $access, $users, $manager, $owner;
    $access->runBackground($users->get($uid), $circle->getSingleId(), function () use ($access, $expected) {
        $access->assertCapability('editBookings');
        $allowed = true;
        try { $access->assertCapability('deleteRecords'); } catch (\DomainException) { $allowed = false; }
        if ($allowed !== ($expected === 'admin')) throw new RuntimeException('Effective backend delete permission mismatch');
    });
    $manager->startSession($owner, true);
    echo "PASS $label (role and backend capabilities)\n";
}
try {
    foreach (['owner', 'member'] as $suffix) {
        $createdUsers[$suffix] = $users->createUser($prefix . '-' . $suffix, bin2hex(random_bytes(24)));
    }
    $owner = $manager->getLocalFederatedUser($createdUsers['owner']->getUID());
    $member = $manager->getLocalFederatedUser($createdUsers['member']->getUID());
    $manager->startSession($owner, true);
    $outer = $manager->createCircle($prefix . '-outer', $owner, false, false, false);
    $circles[] = $outer;
    $direct = $manager->addMember($outer->getSingleId(), $member);
    checkRole($roles, $outer, $createdUsers['owner']->getUID(), 'admin', 'direct owner');
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'direct member');
    $manager->levelMember($direct->getId(), Member::LEVEL_ADMIN);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'admin', 'direct promotion');
    $manager->levelMember($direct->getId(), Member::LEVEL_MODERATOR);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'direct demotion to moderator');
    $manager->removeMember($direct->getId());
    try { $roles->role($outer->getSingleId(), $createdUsers['member']->getUID()); throw new RuntimeException('Removed user retained membership'); }
    catch (\OCA\Circles\Exceptions\MembershipNotFoundException) { echo "PASS direct revocation\n"; }
    $inner = $manager->createCircle($prefix . '-inner', $owner, false, false, false);
    $circles[] = $inner;
    $innerMember = $manager->addMember($inner->getSingleId(), $member);
    $nested = $manager->addMember($outer->getSingleId(), $manager->getFederatedUser($inner->getSingleId()));
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'nested member');
    $manager->levelMember($nested->getId(), Member::LEVEL_ADMIN);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'admin', 'inherited promotion');
    $link = $manager->getLink($outer->getSingleId(), $member->getSingleId());
    if ($link->getInheritanceDepth() <= 1) throw new RuntimeException('Expected inherited membership');
    $manager->levelMember($nested->getId(), Member::LEVEL_MEMBER);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'inherited demotion');
    $manager->levelMember($innerMember->getId(), Member::LEVEL_ADMIN);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'inner admin does not elevate outer membership');
    $manager->removeMember($innerMember->getId());
    try { $roles->role($outer->getSingleId(), $createdUsers['member']->getUID()); throw new RuntimeException('Removed nested user retained membership'); }
    catch (\OCA\Circles\Exceptions\MembershipNotFoundException) { echo "PASS inherited revocation\n"; }
    $groups = \OCP\Server::get(\OCP\IGroupManager::class);
    $group = $groups->createGroup($prefix . '-group');
    $group->addUser($createdUsers['member']);
    $groupMember = $manager->addMember($outer->getSingleId(), $manager->getFederatedUser($group->getGID(), Member::TYPE_GROUP));
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'group member');
    $manager->levelMember($groupMember->getId(), Member::LEVEL_ADMIN);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'admin', 'group admin inheritance');
    $manager->levelMember($groupMember->getId(), Member::LEVEL_MEMBER);
    checkRole($roles, $outer, $createdUsers['member']->getUID(), 'member', 'group role demotion');
} catch (Throwable $error) {
    $failure = $error;
    fwrite(STDERR, $error->getMessage() . "\n");
} finally {
    if (isset($owner)) $manager->startSession($owner, true);
    foreach (array_reverse($circles) as $circle) {
        try { $manager->destroyCircle($circle->getSingleId()); } catch (Throwable $e) { $failure ??= $e; echo 'CLEANUP circle failed: ' . $e->getMessage() . "\n"; }
    }
    $manager->stopSession();
    if ($group !== null) $group->delete();
    foreach ($createdUsers as $user) $user->delete();
    echo "Temporary users and Teams cleaned up\n";
}

exit($failure === null ? 0 : 1);
