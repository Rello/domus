<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\ScopePolicyService;
use OCA\Domus\Service\TeamIntegrationService;
use OCA\Domus\Service\ManagementAccessContext;
use OCP\IAppConfig;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Teams\ITeamManager;
use OCP\Teams\Team;
use PHPUnit\Framework\TestCase;

class ScopePolicyServiceTest extends TestCase {
    private string $stored = '';
    private ScopePolicyService $policy;
    private IUserSession $session;
    private IGroupManager $groups;
    private IL10N $l10n;
    private TeamIntegrationService $teams;

    private function setupPolicy(bool $admin = true): void {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('manager');
        $user->method('isEnabled')->willReturn(true);
        $this->session = $this->createMock(IUserSession::class);
        $this->session->method('getUser')->willReturn($user);
        $this->groups = $this->createMock(IGroupManager::class);
        $this->groups->method('isAdmin')->willReturn($admin);
        $this->l10n = $this->createMock(IL10N::class);
        $this->l10n->method('t')->willReturnArgument(0);
        $config = $this->createMock(IAppConfig::class);
        $config->method('getValueString')->willReturnCallback(fn () => $this->stored);
        $config->method('setValueString')->willReturnCallback(function ($app, $key, $value) { $this->stored = $value; return true; });
        $this->policy = $this->getMockBuilder(ScopePolicyService::class)
            ->setConstructorArgs([$config, $this->groups, $this->session, $this->l10n])
            ->onlyMethods(['allTeams'])->getMock();
        $this->policy->method('allTeams')->willReturn([
            ['teamId' => 'a', 'displayName' => 'Assigned'], ['teamId' => 'b', 'displayName' => 'Unassigned'],
        ]);
        $manager = $this->createMock(ITeamManager::class);
        $manager->method('hasTeamSupport')->willReturn(true);
        $manager->method('getTeamsForUser')->willReturn([new Team('a', 'Assigned', null)]);
        $roles = $this->createMock(\OCA\Domus\Service\CirclesRoleService::class);
        $roles->method('role')->willReturn('admin');
        $this->teams = new TeamIntegrationService($manager, $this->session, $this->groups,
            $this->createMock(\OCP\Group\ISubAdmin::class), $this->createMock(\OCP\App\IAppManager::class),
            $config, $this->l10n, $this->policy, $roles);
    }

    private function context(string $header = '', string $saved = ''): ManagementAccessContext {
        $request = $this->createMock(IRequest::class);
        $request->method('getHeader')->willReturn($header);
        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')->willReturnCallback(function () use (&$saved) { return $saved; });
        $config->method('setUserValue')->willReturnCallback(function ($uid, $app, $key, $value) use (&$saved) { $saved = $value; });
        return new ManagementAccessContext($this->session, $request, $this->teams, $this->l10n, $this->groups, $config, $this->policy);
    }

    public function testAdminCanConfigureUnassignedTeamWithoutGainingPortfolioAccess(): void {
        $this->setupPolicy();
        self::assertCount(2, $this->policy->adminSettings()['teams']);
        $this->policy->save(false, ['b']);
        self::assertFalse($this->policy->allowsPersonal());
        self::assertSame([], $this->teams->listTeams());
        $this->expectException(\DomainException::class);
        $this->context('b')->managementUserId();
    }

    public function testNonAdminCannotChangePolicy(): void {
        $this->setupPolicy(false);
        $this->expectException(\DomainException::class);
        $this->policy->save(true, ['a']);
    }

    public function testNonAdminCannotReadServerTeamDirectory(): void {
        $this->setupPolicy(false);
        $this->expectException(\DomainException::class);
        $this->policy->adminSettings();
    }

    public function testUnknownTeamCannotBeSaved(): void {
        $this->setupPolicy();
        $this->expectException(\InvalidArgumentException::class);
        $this->policy->save(false, ['forged']);
    }

    public function testExistingInstallationDefaultsAndExplicitEmptyList(): void {
        $this->setupPolicy();
        self::assertTrue($this->policy->allowsPersonal());
        self::assertCount(1, $this->teams->listTeams());
        $this->policy->save(true, []);
        self::assertSame([], $this->teams->listTeams());
        self::assertFalse($this->teams->isTeamMember('a', 'manager'));
        self::assertSame('manager', $this->context('Personal')->managementUserId());
    }

    /** @dataProvider disabledPersonalRequests */
    public function testDisabledPersonalRejectsAllRequestForms(string $header): void {
        $this->setupPolicy();
        $this->policy->save(false, ['a']);
        $this->expectException(\DomainException::class);
        $this->context($header)->managementUserId();
    }

    public function disabledPersonalRequests(): array { return [['Personal'], ['personal'], ['']]; }

    public function testPersonalDeactivationIsDenied(): void {
        $this->setupPolicy();
        $this->policy->save(false, ['a']);
        $this->expectException(\DomainException::class);
        $this->context('a')->selectTeam('');
    }

    public function testRevokedSavedTeamNeverFallsBackToPersonal(): void {
        $this->setupPolicy();
        $this->policy->save(false, []);
        $context = $this->context('', 'a');
        self::assertSame('unavailable', $context->capabilities()['mode']);
        self::assertFalse($context->capabilities()['canManage']);
        $this->expectException(\DomainException::class);
        $context->managementUserId();
    }

    public function testSingleAllowedTeamIsSelectedOnBoot(): void {
        $this->setupPolicy();
        $this->policy->save(false, ['a']);
        $context = $this->context();
        self::assertSame('a', $context->capabilities()['activeTeamId']);
        self::assertSame('a', $context->activeTeamId());
    }

    /** @dataProvider backgroundScopes */
    public function testBackgroundWorkCannotUseDisabledScope(?string $team): void {
        $this->setupPolicy();
        $this->policy->save(false, []);
        $this->expectException(\DomainException::class);
        $this->context()->runBackground($this->session->getUser(), $team, fn () => self::fail('Must not run'));
    }

    public function backgroundScopes(): array { return [[null], ['a']]; }

    public function testInvalidPolicyFailsClosed(): void {
        $this->setupPolicy();
        $this->stored = '{}';
        $this->expectException(\RuntimeException::class);
        $this->context('Personal')->managementUserId();
    }
    public function testDisabledTeamIsRemovedFromRenterIdentity(): void {
        $this->setupPolicy();
        $this->policy->save(true, []);
        $mapper = $this->createMock(\OCA\Domus\Db\RenterAccessMapper::class);
        $mapper->method('partnersForUser')->willReturn([['team_id' => 'a']]);
        $mapper->expects(self::never())->method('linkedTenancies');
        $service = new \OCA\Domus\Service\RenterAccessService($mapper, $this->context(), $this->teams,
            $this->createMock(\OCP\IUserManager::class), $this->l10n, $this->policy);
        self::assertSame([], $service->identity()['tenancies']);
        self::assertSame([], $service->identity()['partners']);
    }

    public function testDisabledTeamRejectsRenterContactWrites(): void {
        $this->setupPolicy();
        $this->policy->save(true, []);
        $mapper = $this->createMock(\OCA\Domus\Db\RenterPortalMapper::class);
        $mapper->expects(self::never())->method('rows');
        $service = new \OCA\Domus\Service\RenterPortalService($mapper,
            $this->createMock(\OCA\Domus\Db\RenterAccessMapper::class), $this->context(), $this->teams,
            $this->createMock(\OCP\Files\IRootFolder::class), $this->createMock(\OCP\IUserManager::class),
            $this->createMock(\OCP\IURLGenerator::class), $this->l10n, $this->policy);
        $this->expectException(\DomainException::class);
        $service->requestCorrection('a', 1, ['name' => 'New name']);
    }

}
