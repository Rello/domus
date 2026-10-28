<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\RenterAccessMapper;
use OCA\Domus\Service\AuditService;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\{IL10N, IUser, IUserSession};
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class AuditServiceTest extends TestCase {
    private array $events = [];
    private function audit(): AuditService {
        $dispatcher = $this->createMock(IEventDispatcher::class);
        $dispatcher->method('dispatchTyped')->willReturnCallback(function ($event) {
            // Every parameter must be represented in the rendered audit message.
            self::assertSame(count($event->getParameters()), substr_count($event->getMessage(), '%s'));
            $this->events[] = $event->getParameters();
        });
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('manager');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);
        return new AuditService($dispatcher, $session, $this->createMock(LoggerInterface::class));
    }

    public function testAccountTransitionsAndNoOps(): void {
        $audit = $this->audit();
        $audit->account(3, 'owner', 'team-a', null, 'renter');
        $audit->account(3, 'owner', 'team-a', 'renter', 'renter');
        $audit->account(3, 'owner', 'team-a', 'renter', 'other');
        $audit->account(3, 'owner', 'team-a', 'other', null);
        $audit->account(3, 'owner', 'team-a', '', null);
        self::assertSame(['domus.account.linked', 'domus.account.replaced', 'domus.account.unlinked'], array_column($this->events, 'event'));
        self::assertSame('manager', $this->events[0]['actor']);
        self::assertSame('team-a', $this->events[0]['scope']);
    }

    public function testReorderedPartnersAndOrdinaryEditsAreNotAudited(): void {
        $audit = $this->audit();
        $audit->relationships(3, 'owner', null, 1, 1, [2, 1], [1, 2, 2]);
        self::assertSame([], $this->events);
        $audit->relationships(3, 'owner', null, 1, 2, [1, 2], [2]);
        self::assertSame('Personal', $this->events[0]['scope']);
        self::assertSame('1,2', $this->events[0]['oldPartners']);
        self::assertSame('2', $this->events[0]['newPartners']);
    }

    public function testOtherActivityEventsAreRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->audit()->record('booking_year.closed', 1, 'owner', null);
    }

    public function testDeliveryFailureDoesNotFailCommittedAction(): void {
        $dispatcher = $this->createMock(IEventDispatcher::class);
        $dispatcher->method('dispatchTyped')->willThrowException(new \RuntimeException('Unavailable'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');
        (new AuditService($dispatcher, $this->createMock(IUserSession::class), $logger))->record('unit.deleted', 1, 'owner', null);
    }

    public function testUserCleanupDefersAuditUntilCommitAndRetriesAreQuiet(): void {
        $db = new TransferDatabase();
        $db->tables['domus_units'] = [['id' => 5, 'user_id' => 'owner', 'team_id' => null]];
        $db->tables['domus_partners'] = [['id' => 1, 'user_id' => 'other', 'team_id' => 'team-a', 'partner_type' => 'tenant', 'nc_user_id' => 'owner']];
        $audit = $this->audit();
        $service = new \OCA\Domus\Service\UserCleanupService($db,
            new RenterAccessMapper($db, $this->createMock(IL10N::class), $audit),
            $this->createMock(\OCA\Domus\Service\UnitMoveGuard::class),
            $this->createMock(\OCP\TaskProcessing\IManager::class), $audit);
        $service->cleanup('owner');
        self::assertSame(1, $db->commits);
        self::assertSame(['domus.account.unlinked', 'domus.unit.deleted'], array_column($this->events, 'event'));
        $service->cleanup('owner');
        self::assertCount(2, $this->events);
    }

    public function testAtomicAccountLinkAndDeletionCleanupAreAuditedOnce(): void {
        $db = new TransferDatabase();
        $db->tables['domus_partners'] = [['id' => 1, 'user_id' => 'owner', 'team_id' => 'team-a', 'partner_type' => 'tenant', 'nc_user_id' => null]];
        $mapper = new RenterAccessMapper($db, $this->createMock(IL10N::class), $this->audit());
        $mapper->linkUser('team-a', 1, 'renter');
        self::assertCount(1, $this->events);
        try { $mapper->linkUser('team-a', 1, 'other'); self::fail('Must reject replacement through link action'); }
        catch (\DomainException $e) { self::assertCount(1, $this->events); }
        $mapper->unlinkDeletedUser('renter');
        $mapper->unlinkDeletedUser('renter');
        self::assertCount(2, $this->events);
        self::assertSame('domus.account.unlinked', $this->events[1]['event']);
        self::assertNull($db->tables['domus_partners'][0]['nc_user_id']);
    }
}
