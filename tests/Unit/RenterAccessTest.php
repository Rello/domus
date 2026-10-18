<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Controller\RenterAccessController;
use OCA\Domus\Db\RenterAccessMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\RenterAccessService;
use OCA\Domus\Service\TeamIntegrationService;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class RenterAccessTest extends TestCase {
    private TransferDatabase $db;
    private RenterAccessMapper $mapper;
    private RenterAccessService $service;
    private RenterAccessController $controller;
    private array $users = [];
    private array $emails = [];
    private array $guests = [];
    private array $membership = ['manager-a' => ['a'], 'manager-b' => ['b']];
    private string $actor = 'manager-a';
    private string $team = 'a';
    private bool $guestsAllowed = true;

    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $this->db->tables = [
            'domus_partners' => [
                ['id' => 1, 'team_id' => 'a', 'partner_type' => 'tenant', 'email' => 'renter@example.invalid', 'name' => 'Renter', 'nc_user_id' => null],
                ['id' => 2, 'team_id' => 'b', 'partner_type' => 'tenant', 'email' => 'renter@example.invalid', 'name' => 'Renter'],
                ['id' => 3, 'team_id' => null, 'partner_type' => 'tenant', 'email' => 'renter@example.invalid', 'name' => 'Personal'],
            ],
            'domus_tenancies' => [
                ['id' => 11, 'team_id' => 'a', 'unit_id' => 101, 'start_date' => '2020-01-01', 'end_date' => '2021-01-01', 'conditions' => 'private', 'base_rent' => '850.00'],
                ['id' => 22, 'team_id' => 'b', 'unit_id' => 202, 'start_date' => '2021-01-01', 'end_date' => null],
            ],
            'domus_partner_rel' => [
                ['team_id' => 'a', 'partner_id' => 1, 'type' => 'tenancy', 'relation_id' => 11],
                ['team_id' => 'b', 'partner_id' => 2, 'type' => 'tenancy', 'relation_id' => 22],
            ],
            'domus_units' => [['id' => 101, 'team_id' => 'a', 'label' => 'Home A'], ['id' => 202, 'team_id' => 'b', 'label' => 'Home B']],
        ];
        $this->addUser('manager-a', 'a@example.invalid');
        $this->addUser('manager-b', 'b@example.invalid');
        $this->addUser('canonical-renter', 'renter@example.invalid');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturnCallback(fn () => $this->users[$this->actor] ?? null);
        $request = $this->createMock(IRequest::class);
        $request->method('getHeader')->willReturnCallback(fn ($header) => $header === 'X-Domus-Team' ? $this->team : 'admin');
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $groups = $this->createMock(IGroupManager::class);
        $groups->method('isInGroup')->willReturnCallback(fn ($uid) => in_array($uid, $this->guests, true));
        $teams = $this->createMock(TeamIntegrationService::class);
        $policy = function (string $team, IUser $user): void {
            if (!$user->isEnabled() || in_array($user->getUID(), $this->guests, true)
                || !in_array($team, $this->membership[$user->getUID()] ?? [], true)) {
                throw new \DomainException('Team denied');
            }
        };
        $teams->method('assertTeamAdmin')->willReturnCallback(fn ($team) => $policy($team, $this->users[$this->actor]));
        $teams->method('getGuestCreationContext')->willReturnCallback(fn () => ['canCreate' => $this->guestsAllowed, 'message' => 'Guests policy blocks creation']);
        $access = new ManagementAccessContext($session, $request, $teams, $l10n, $groups);
        $directory = $this->createMock(IUserManager::class);
        $directory->method('getByEmail')->willReturnCallback(fn ($email) => array_values(array_filter($this->users, fn ($u) => $u->getEMailAddress() === $email)));
        $directory->method('get')->willReturnCallback(fn ($uid) => $this->users[$uid] ?? null);
        $this->mapper = new RenterAccessMapper($this->db, $l10n);
        $this->service = new RenterAccessService($this->mapper, $access, $teams, $directory, $l10n);
        $this->controller = new RenterAccessController($request, $this->service, $l10n, $this->createMock(LoggerInterface::class));
    }

    private function addUser(string $uid, string $email, bool $guest = false, bool $enabled = true): void {
        $this->emails[$uid] = $email;
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn($uid);
        $user->method('isEnabled')->willReturn($enabled);
        $user->method('getEMailAddress')->willReturnCallback(fn () => $this->emails[$uid]);
        $this->users[$uid] = $user;
        if ($guest) $this->guests[] = $uid;
    }

    public function testAccountDeletionPreservesHistoryAndPreventsUidReuseAccess(): void {
        $this->controller->link(1, 'a');
        $this->actor = 'manager-b'; $this->team = 'b';
        $this->controller->link(2, 'b');
        $this->db->tables['domus_partners'][2]['nc_user_id'] = 'unrelated';
        $businessHistory = $this->db->tables['domus_tenancies'];
        $listener = new \OCA\Domus\Listener\UserDeletedListener($this->mapper);
        $listener->handle(new \OCP\EventDispatcher\Event());
        self::assertSame('canonical-renter', $this->db->tables['domus_partners'][0]['nc_user_id']);
        $listener->handle(new \OCP\User\Events\UserDeletedEvent($this->users['canonical-renter']));
        self::assertSame([null, null, 'unrelated'], array_column($this->db->tables['domus_partners'], 'nc_user_id'));
        self::assertSame($businessHistory, $this->db->tables['domus_tenancies']);
        $this->addUser('canonical-renter', 'new-identity@example.invalid');
        $this->actor = 'canonical-renter';
        self::assertSame([], $this->controller->identity()->getData()['partners']);
        self::assertSame([], $this->controller->identity()->getData()['tenancies']);
    }

    public function testMembershipRemovalImmediatelyDeniesAccountAdministration(): void {
        $this->controller->link(1, 'a');
        $records = $this->db->tables;
        $this->membership['manager-a'] = [];
        self::assertSame(403, $this->controller->status(1, 'a')->getStatus());
        self::assertSame(403, $this->controller->link(1, 'a', 'manager-b')->getStatus());
        self::assertSame($records, $this->db->tables);
    }

    public function testAssignmentImmediatelyAllowsPartnerAndAllLinkedHistoricalTenancies(): void {
        self::assertSame(['ncUserId' => '', 'accountEnabled' => null], $this->controller->status(1, 'a')->getData());
        self::assertSame('canonical-renter', $this->controller->link(1, 'a')->getData()['ncUserId']);
        $this->actor = 'canonical-renter'; $this->team = 'forged-team';
        $data = $this->controller->identity()->getData();
        self::assertSame([1], array_column($data['partners'], 'id'));
        self::assertSame([['teamId' => 'a', 'id' => 11, 'unitLabel' => 'Home A', 'startDate' => '2020-01-01', 'endDate' => '2021-01-01', 'baseRent' => '850.00']], $data['tenancies']);
        self::assertTrue($data['canAccessTenancies']);
        self::assertStringNotContainsString('private', json_encode($data));
        $this->db->tables['domus_tenancies'][] = ['id' => 12, 'team_id' => 'a', 'unit_id' => 101, 'start_date' => '2026-01-01', 'end_date' => null];
        $this->db->tables['domus_partner_rel'][] = ['team_id' => 'a', 'partner_id' => 1, 'type' => 'tenancy', 'relation_id' => 12];
        self::assertSame([11, 12], array_column($this->controller->identity()->getData()['tenancies'], 'id'));
        $this->db->tables['domus_partner_rel'] = [];
        self::assertSame([], $this->controller->identity()->getData()['tenancies']);
        self::assertCount(1, $this->controller->identity()->getData()['partners']);
    }

    public function testClearingPartnerUserIdRemovesOnlyThatPartnersAccess(): void {
        $this->controller->link(1, 'a');
        $this->actor = 'manager-b'; $this->team = 'b';
        $this->controller->link(2, 'b');
        $this->actor = 'canonical-renter';
        self::assertCount(2, $this->controller->identity()->getData()['tenancies']);
        $this->db->tables['domus_partners'][0]['nc_user_id'] = '';
        self::assertSame(['b'], array_column($this->controller->identity()->getData()['tenancies'], 'teamId'));
        $this->db->tables['domus_partners'][1]['nc_user_id'] = null;
        self::assertSame([], $this->controller->identity()->getData()['partners']);
        self::assertArrayHasKey('canonical-renter', $this->users);
    }

    public function testForgedTeamAndPartnerRequestsCannotLinkAccounts(): void {
        foreach ([[1, 'b'], [2, 'a'], [3, 'a']] as $args) {
            self::assertSame(403, $this->controller->link(...$args)->getStatus());
        }
        $this->actor = 'canonical-renter';
        self::assertSame(403, $this->controller->status(1, 'a')->getStatus());
        self::assertSame(403, $this->controller->link(1, 'a')->getStatus());
        self::assertSame([], $this->controller->identity()->getData()['partners']);
    }

    public function testCrossTeamRelationshipsAndUnitsCannotBroadenAccess(): void {
        $this->controller->link(1, 'a');
        $this->db->tables['domus_partners'][2]['nc_user_id'] = 'canonical-renter';
        $this->db->tables['domus_partner_rel'][] = ['team_id' => 'a', 'partner_id' => 1, 'type' => 'tenancy', 'relation_id' => 22];
        $this->actor = 'canonical-renter';
        self::assertSame([11], array_column($this->controller->identity()->getData()['tenancies'], 'id'));
        self::assertSame([1], array_column($this->controller->identity()->getData()['partners'], 'id'));
        $this->db->tables['domus_units'][0]['team_id'] = 'b';
        self::assertSame([], $this->controller->identity()->getData()['tenancies']);
    }

    public function testGuestCreationReturnsDetailsAndRetryReusesCreatedAccount(): void {
        unset($this->users['canonical-renter']);
        self::assertSame(['needsGuest' => true, 'email' => 'renter@example.invalid', 'displayName' => 'Renter'], $this->controller->link(1, 'a')->getData());
        self::assertNull($this->mapper->partner('a', 1)['nc_user_id']);
        // Guests created the account but its response was lost: retry resolves the directory.
        $this->addUser('returned-hashed-uid', 'renter@example.invalid', true);
        self::assertSame('returned-hashed-uid', $this->controller->link(1, 'a')->getData()['ncUserId']);
        $this->actor = 'returned-hashed-uid';
        self::assertTrue($this->controller->identity()->getData()['canAccessTenancies']);
        self::assertSame(403, $this->controller->link(1, 'a')->getStatus());
    }

    public function testExplicitUidAndLiveEnabledStatus(): void {
        self::assertSame(400, $this->controller->link(1, 'a', 'missing')->getStatus());
        $this->addUser('canonical-renter', 'renter@example.invalid', false, false);
        self::assertSame(['ncUserId' => 'canonical-renter', 'accountEnabled' => false], $this->controller->link(1, 'a', ' canonical-renter ')->getData());
        $this->actor = 'canonical-renter';
        self::assertSame(403, $this->controller->identity()->getStatus());
        $this->actor = 'manager-a';
        $this->addUser('canonical-renter', 'renter@example.invalid');
        self::assertTrue($this->controller->status(1, 'a')->getData()['accountEnabled']);
        unset($this->users['canonical-renter']);
        self::assertSame(['ncUserId' => '', 'accountEnabled' => null], $this->controller->status(1, 'a')->getData());
        self::assertNull($this->mapper->partner('a', 1)['nc_user_id']);
        $this->addUser('replacement-renter', 'renter@example.invalid');
        self::assertSame('replacement-renter', $this->controller->link(1, 'a', 'replacement-renter')->getData()['ncUserId']);
    }

    public function testLinkReplacesMissingAccountWithoutPriorStatusRefresh(): void {
        self::assertSame('canonical-renter', $this->controller->link(1, 'a', 'canonical-renter')->getData()['ncUserId']);
        unset($this->users['canonical-renter']);
        $this->addUser('replacement-renter', 'renter@example.invalid');
        self::assertSame('replacement-renter', $this->controller->link(1, 'a', 'replacement-renter')->getData()['ncUserId']);
        self::assertSame('replacement-renter', $this->mapper->partner('a', 1)['nc_user_id']);
    }

    public function testGuestPolicyOnlyBlocksNewAccounts(): void {
        $this->guestsAllowed = false;
        unset($this->users['canonical-renter']);
        self::assertSame(403, $this->controller->link(1, 'a')->getStatus());
        $this->addUser('existing-guest', 'renter@example.invalid', true);
        self::assertSame(200, $this->controller->link(1, 'a')->getStatus());
    }

    public function testAmbiguousEmailRequiresExplicitUid(): void {
        $this->addUser('another', 'renter@example.invalid');
        self::assertSame(400, $this->controller->link(1, 'a')->getStatus());
        self::assertNull($this->mapper->partner('a', 1)['nc_user_id']);
        self::assertSame('another', $this->controller->link(1, 'a', 'another')->getData()['ncUserId']);
    }

    public function testConcurrentAssignmentCannotOverwriteLinkedAccount(): void {
        $this->mapper->linkUser('a', 1, 'canonical-renter');
        self::assertSame('canonical-renter', $this->controller->link(1, 'a', 'manager-a')->getData()['ncUserId']);
        $this->expectException(\DomainException::class);
        $this->mapper->linkUser('a', 1, 'manager-a');
    }
}
