<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\TeamIntegrationService;
use OCP\App\IAppManager;
use OCP\Group\ISubAdmin;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Teams\ITeamManager;
use OCP\Teams\Team;
use PHPUnit\Framework\TestCase;

class TeamIntegrationServiceTest extends TestCase {
    private function buildService(
        array $teams = [],
        bool $teamSupport = true,
        bool $guest = false,
        bool $guestApp = true,
        bool $groupSharing = false,
        array $inviterGroups = [],
        string $allowlist = 'domus',
        ?ITeamManager $teamManager = null,
    ): TeamIntegrationService {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('manager');
        $user->method('isEnabled')->willReturn(true);

        $userSession = $this->createMock(IUserSession::class);
        $userSession->method('getUser')->willReturn($user);

        if ($teamManager === null) {
            $teamManager = $this->createMock(ITeamManager::class);
            $teamManager->method('hasTeamSupport')->willReturn($teamSupport);
            $teamManager->method('getTeamsForUser')->with('manager')->willReturn($teams);
        }

        $groupManager = $this->createMock(IGroupManager::class);
        $groupManager->method('isInGroup')->willReturn($guest);
        $groupManager->method('isAdmin')->willReturn(false);
        $groupManager->method('getUserGroupIds')->willReturn([]);

        $subAdmin = $this->createMock(ISubAdmin::class);
        $subAdmin->method('isSubAdmin')->willReturn(false);

        $appManager = $this->createMock(IAppManager::class);
        $appManager->method('isEnabledForUser')->willReturn($guestApp);

        $appConfig = $this->createMock(IAppConfig::class);
        $appConfig->method('getValueBool')->willReturnCallback(
            static fn (string $app, string $key, bool $default): bool => match ($app . '.' . $key) {
                'core.shareapi_only_share_with_group_members' => $groupSharing,
                'guests.usewhitelist' => true,
                default => $default,
            }
        );
        $appConfig->method('getValueArray')->willReturn($inviterGroups);
        $appConfig->method('getValueString')->willReturn($allowlist);

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);

        return new TeamIntegrationService(
            $teamManager,
            $userSession,
            $groupManager,
            $subAdmin,
            $appManager,
            $appConfig,
            $l10n,
        );
    }

    public function testSelectedTeamMemberGetsTemporaryAdminPermission(): void {
        $service = $this->buildService([new Team('team-a', 'Portfolio A', null)]);

        self::assertSame([['teamId' => 'team-a', 'displayName' => 'Portfolio A', 'role' => 'admin']], $service->listTeams());
        $service->assertTeamAdmin('team-a');
        self::assertNull($service->getTeamFolder('team-a'));
    }

    public function testMembershipIsLoadedOncePerUserAndRecheckedOnTheNextRequest(): void {
        $manager = $this->createMock(ITeamManager::class);
        $manager->method('hasTeamSupport')->willReturn(true);
        $manager->expects(self::exactly(3))->method('getTeamsForUser')->willReturnOnConsecutiveCalls(
            [new Team('team-a', 'A', null)], [new Team('team-b', 'B', null)], []);
        $service = $this->buildService(teamManager: $manager);
        $service->assertTeamAdmin('team-a');
        $service->assertTeamAdmin('team-a');
        self::assertCount(1, $service->listTeams());
        self::assertTrue($service->isTeamMember('team-a', 'manager'));
        self::assertTrue($service->isTeamMember('team-b', 'other'));
        self::assertFalse($service->isTeamMember('team-a', 'other'));

        // A new request gets a new service, so revoked membership cannot survive.
        $nextRequest = $this->buildService(teamManager: $manager);
        $this->expectException(\DomainException::class);
        $nextRequest->assertTeamAdmin('team-a');
    }

    public function testClearingContextSnapshotForcesMembershipRefresh(): void {
        $manager = $this->createMock(ITeamManager::class);
        $manager->method('hasTeamSupport')->willReturn(true);
        $manager->expects(self::exactly(2))->method('getTeamsForUser')->with('manager')->willReturnOnConsecutiveCalls(
            [new Team('team-a', 'A', null)], []);
        $service = $this->buildService(teamManager: $manager);
        $service->assertTeamAdmin('team-a');
        $service->clearRequestCache();
        $this->expectException(\DomainException::class);
        $service->assertTeamAdmin('team-a');
    }

    public function testUnrelatedTeamIsDenied(): void {
        $service = $this->buildService([new Team('team-a', 'Portfolio A', null)]);

        $this->expectException(\DomainException::class);
        $service->assertTeamAdmin('team-b');
    }

    public function testGuestCannotUseManagementTeamMembership(): void {
        $service = $this->buildService([new Team('team-a', 'Portfolio A', null)], guest: true);

        $this->expectException(\DomainException::class);
        $service->assertTeamAdmin('team-a');
    }

    public function testMissingTeamsBackendFailsClosed(): void {
        $service = $this->buildService(teamSupport: false);

        $this->expectException(\RuntimeException::class);
        $service->listTeams();
    }

    public function testGuestCreationRequiresTeamMembership(): void {
        $service = $this->buildService();

        $this->expectException(\DomainException::class);
        $service->getGuestCreationContext('team-a');
    }

    /** @dataProvider guestPrerequisites */
    public function testGuestCreationPrerequisites(bool $guestApp, bool $groupSharing, array $inviterGroups, string $allowlist, bool $expected): void {
        $service = $this->buildService(
            [new Team('team-a', 'Portfolio A', null)],
            guestApp: $guestApp,
            groupSharing: $groupSharing,
            inviterGroups: $inviterGroups,
            allowlist: $allowlist,
        );

        $context = $service->getGuestCreationContext('team-a');
        self::assertSame($expected, $context['canCreate']);
        self::assertSame($expected, $context['message'] === null);
    }

    public static function guestPrerequisites(): array {
        return [
            'ready' => [true, false, [], 'files,domus', true],
            'Guests disabled' => [false, false, [], 'domus', false],
            'group sharing restricted' => [true, true, [], 'domus', false],
            'inviter group required' => [true, false, ['staff'], 'domus', false],
            'Domus not allowlisted' => [true, false, [], 'files', false],
        ];
    }
}
