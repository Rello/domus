<?php
// SPDX-FileCopyrightText: 2026 Marcel Scherello
// SPDX-License-Identifier: AGPL-3.0-or-later
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\{CirclesRoleService, TeamPermissionService, ManagementAccessContext, TeamIntegrationService};
use OCA\Domus\Middleware\TeamPermissionMiddleware;
use OCP\{IRequest, IUser, IUserSession, IGroupManager, IL10N};
use PHPUnit\Framework\TestCase;

class TeamPermissionTest extends TestCase {
    public function testAdapterUsesFederatedIdAndDoesNotCacheRoles(): void {
        $manager = new class {
            public int $level = 1;
            public function getLocalFederatedUser(string $uid): object {
                TestCase::assertSame('alice', $uid);
                return new class { public function getSingleId(): string { return 'federated-alice'; } };
            }
            public function getLink(string $team, string $single): object {
                TestCase::assertSame('team-a', $team);
                TestCase::assertSame('federated-alice', $single);
                return new class($this->level) {
                    public function __construct(private int $level) {}
                    public function getLevel(): int { return $this->level; }
                };
            }
        };
        $adapter = new class($manager) extends CirclesRoleService {
            public function __construct(private object $provider) {}
            protected function manager(): object { return $this->provider; }
        };
        foreach ([1 => 'member', 8 => 'admin', 4 => 'member', 9 => 'admin', 0 => 'none', 99 => 'none'] as $level => $expected) {
            $manager->level = $level;
            self::assertSame($expected, $adapter->role('team-a', 'alice'));
        }
    }

    public function testEveryManagementMutationHasAnExplicitPolicy(): void {
        $routes = require __DIR__ . '/../../appinfo/routes.php';
        $allowed = [
            'Partner#create', 'Partner#update', 'Booking#create', 'Booking#update',
            'BookingAssignmentPreview#create', 'BookingAssignmentPreview#discard',
            'Document#link', 'Document#upload', 'Document#attach',
            'Task#createForEntity', 'Task#update', 'Task#close', 'Task#reopen', 'Task#remind',
            'WorkflowRun#createForEntity', 'WorkflowRun#closeStep', 'WorkflowRun#closeEarly', 'WorkflowRun#reopenStep', 'WorkflowRun#remindStep',
            'ActionLog#createForEntity', 'ActionLog#update', 'RenterPortal#decide',
        ];
        $independent = ['RenterPortal#requestCorrection', 'TeamIntegration#activate', 'TeamIntegration#deactivate', 'TeamIntegration#savePolicy'];
        foreach ($routes['routes'] as $route) {
            if ($route['verb'] === 'GET') continue;
            [$controller, $method] = explode('#', $route['name']);
            $required = TeamPermissionService::required($controller, $method, $route['verb']);
            if (in_array($route['name'], $independent, true)) {
                self::assertNull($required, $route['name']);
            } else {
                self::assertNotNull($required, $route['name']);
                self::assertSame(in_array($route['name'], $allowed, true), TeamPermissionService::capabilities('member')[$required], $route['name']);
                self::assertTrue(TeamPermissionService::capabilities('admin')[$required]);
                self::assertFalse(TeamPermissionService::capabilities('none')[$required]);
            }
        }
        self::assertSame('managePortfolio', TeamPermissionService::required('Future', 'mutate', 'POST'));
    }

    public function testPayloadCannotEscalateContactOrDocumentWrites(): void {
        self::assertSame('manageRenterAccess', TeamPermissionService::required('Partner', 'update', 'PUT', ['ncUserId' => '']));
        self::assertSame('deleteRecords', TeamPermissionService::required('Document', 'attach', 'POST', ['sourceLinkId' => 5]));
    }

    public function testMiddlewareRechecksRoleForEveryMutation(): void {
        $role = 'admin';
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $user->method('isEnabled')->willReturn(true);
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);
        $request = $this->getMockBuilder(IRequest::class)->onlyMethods(['getHeader'])->addMethods(['getMethod', 'getParams'])->getMock();
        $request->method('getHeader')->willReturn('team-a');
        $request->method('getMethod')->willReturn('DELETE');
        $request->method('getParams')->willReturn([]);
        $teams = $this->createMock(TeamIntegrationService::class);
        $teams->method('roleForUser')->willReturnCallback(function () use (&$role) { return $role; });
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $access = new ManagementAccessContext($session, $request, $teams, $l10n, $this->createMock(IGroupManager::class));
        $middleware = new TeamPermissionMiddleware($access, $request);
        $controller = (new \ReflectionClass(\OCA\Domus\Controller\BookingController::class))->newInstanceWithoutConstructor();
        $middleware->beforeController($controller, 'destroy');
        $role = 'member';
        try { $middleware->beforeController($controller, 'destroy'); self::fail('Demoted actor may not delete'); }
        catch (\DomainException) {}
        $access->assertCapability('editBookings');
        $role = 'none';
        $this->expectException(\DomainException::class);
        $access->assertCapability('editBookings');
    }
    /** @dataProvider accountChanges */
    public function testContactWritesCannotChangeRenterAccess(string $operation, array $data): void {
        $partner = new \OCA\Domus\Db\Partner();
        $partner->setId(7);
        $partner->setName('Tenant');
        $partner->setPartnerType('tenant');
        $partner->setNcUserId('renter');
        $mapper = $this->createMock(\OCA\Domus\Db\PartnerMapper::class);
        $mapper->method('findForUser')->willReturn($partner);
        $mapper->expects(self::never())->method('insert');
        $mapper->expects(self::never())->method('update');
        $tenancies = $this->createMock(\OCA\Domus\Service\TenancyService::class);
        $tenancies->method('getTenanciesForPartner')->willReturn([]);
        $access = $this->createMock(ManagementAccessContext::class);
        $access->expects(self::once())->method('assertCapability')->with('manageRenterAccess')
            ->willThrowException(new \DomainException('Administrator required'));
        $service = new \OCA\Domus\Service\PartnerService(
            $mapper, $this->createMock(\OCA\Domus\Db\PartnerRelMapper::class), $tenancies,
            $this->createMock(\OCA\Domus\Service\PermissionService::class),
            $this->createMock(IL10N::class), $this->createMock(\OCP\IDBConnection::class), null, $access,
        );
        $this->expectException(\DomainException::class);
        if ($operation === 'create') $service->createPartner($data, 'alice', 'landlord');
        else $service->updatePartner(7, $data, 'alice', 'landlord');
    }

    public static function accountChanges(): array {
        return [
            ['create', ['ncUserId' => 'renter']],
            ['update', ['ncUserId' => 'other']],
            ['update', ['ncUserId' => '']],
            ['update', ['partnerType' => 'contractor']],
        ];
    }

}
