<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\TeamIntegrationService;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

class ManagementAccessContextTest extends TestCase {
    private function context(string $selectedTeam, bool $enabled = true, ?string $mappedTeam = null, bool $guest = false, bool $teamsAvailable = true): ManagementAccessContext {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('manager');
        $user->method('isEnabled')->willReturn($enabled);
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);
        $request = $this->createMock(IRequest::class);
        $request->method('getHeader')->with('X-Domus-Team')->willReturn($selectedTeam);
        $teams = $this->createMock(TeamIntegrationService::class);
        $teams->method('assertTeamAdmin')->willReturnCallback(static function (string $teamId): void {
            if ($teamId !== 'team-a') {
                throw new \DomainException('Unknown Team');
            }
        });
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $groups = $this->createMock(IGroupManager::class);
        $groups->method('isInGroup')->willReturn($guest);
        return new ManagementAccessContext($session, $request, $teamsAvailable ? $teams : null, $l10n, $groups);
    }

    public function testSelectedTeamIsAuthorizedAndActorRemainsSeparate(): void {
        self::assertSame([
            'actorUserId' => 'manager',
            'activeTeamId' => 'team-a',
            'canManage' => true,
            'mode' => 'team',
        ], $this->context('team-a')->capabilities());
    }

    public function testUnrelatedTeamIsDenied(): void {
        $this->expectException(\DomainException::class);
        $this->context('team-b')->activeTeamId();
    }

    public function testForgedSubmittedTeamIsDenied(): void {
        $this->expectException(\DomainException::class);
        $this->context('team-a')->assertSubmittedTeam('team-b');
    }

    public function testDisabledActorIsDenied(): void {
        $this->expectException(\DomainException::class);
        $this->context('team-a', false)->actorUserId();
    }

    public function testUnmappedLegacyOwnerKeepsOwnAccess(): void {
        self::assertSame('manager', $this->context('')->legacyOwnerUserId());
    }

    public function testPersonalAccessCoexistsWithTeamRows(): void {
        self::assertSame('manager', $this->context('', mappedTeam: 'team-a')->legacyOwnerUserId());
        self::assertSame('personal', $this->context('', mappedTeam: 'team-a')->capabilities()['mode']);
    }

    public function testGuestHasNoManagementContext(): void {
        self::assertSame('external', $this->context('', guest: true)->capabilities()['mode']);
    }

    public function testGuestCannotEnterLegacyManagement(): void {
        $this->expectException(\DomainException::class);
        $this->context('', guest: true)->legacyOwnerUserId();
    }

    public function testChangingTeamRefreshesTheRequestMembershipSnapshot(): void {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('manager');
        $user->method('isEnabled')->willReturn(true);
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);
        $request = $this->createMock(IRequest::class);
        $request->method('getHeader')->willReturn('');
        $teams = $this->createMock(TeamIntegrationService::class);
        $teams->expects(self::once())->method('clearRequestCache');
        $teams->expects(self::exactly(2))->method('assertTeamAdmin')->with('team-b');
        $selected = 'team-a';
        $config = $this->createMock(\OCP\IConfig::class);
        $config->method('getUserValue')->willReturnCallback(static function () use (&$selected) { return $selected; });
        $config->expects(self::once())->method('setUserValue')->with('manager', 'domus', 'activeTeamId', 'team-b')
            ->willReturnCallback(static function ($uid, $app, $key, $value) use (&$selected): void { $selected = $value; });
        $context = new ManagementAccessContext($session, $request, $teams, $this->createMock(IL10N::class), $this->createMock(IGroupManager::class), $config);
        self::assertSame('team-b', $context->selectTeam('team-b')['activeTeamId']);
    }

    public function testMissingTeamsCapabilityDeniesTeamSelectionButKeepsLegacyOwner(): void {
        self::assertSame('manager', $this->context('', teamsAvailable: false)->legacyOwnerUserId());
        $this->expectException(\RuntimeException::class);
        $this->context('team-a', teamsAvailable: false)->activeTeamId();
    }
    public function testBackgroundContextIsRestoredAfterFailure(): void {
        $context = $this->context('team-a');
        $user = $this->createMock(\OCP\IUser::class);
        $user->method('getUID')->willReturn('job-owner');
        $user->method('isEnabled')->willReturn(true);
        try {
            $context->runBackground($user, null, function () use ($context) {
                self::assertNull($context->activeTeamId());
                self::assertSame('job-owner', $context->managementUserId());
                throw new \RuntimeException('job failed');
            });
            self::fail('Expected failure');
        } catch (\RuntimeException $e) {
            self::assertSame('job failed', $e->getMessage());
        }
        self::assertSame('manager', $context->actorUserId());
        self::assertSame('team-a', $context->activeTeamId());
    }

    public function testBackgroundTeamRequiresCurrentMembership(): void {
        $context = $this->context('');
        $user = $this->createMock(\OCP\IUser::class);
        $user->method('getUID')->willReturn('former-member');
        $user->method('isEnabled')->willReturn(true);
        $this->expectException(\DomainException::class);
        $context->runBackground($user, 'team-a', fn() => self::fail('Access must be rechecked'));
    }
}
