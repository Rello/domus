<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\RenterAccessMapper;
use OCA\Domus\Db\RenterPortalMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\RenterPortalService;
use OCA\Domus\Service\TeamIntegrationService;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;

class RenterPortalTest extends TestCase {
    private TransferDatabase $db;
    private RenterPortalService $service;
    private string $actor = 'renter';
    private bool $staffMember = true;
    private bool $readable = true;
    private bool $fileExists = true;
    private bool $enabled = true;

    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $this->db->tables = [
            'domus_partners' => [
                ['id' => 1, 'team_id' => 'a', 'partner_type' => 'tenant', 'nc_user_id' => 'renter', 'name' => 'Alice', 'email' => 'alice@example.test', 'notes' => 'PRIVATE CONTACT'],
                ['id' => 2, 'team_id' => 'a', 'partner_type' => 'tenant', 'nc_user_id' => 'other-renter', 'name' => 'Bob', 'email' => 'PRIVATE BOB'],
                ['id' => 3, 'team_id' => 'b', 'partner_type' => 'tenant', 'nc_user_id' => 'renter', 'name' => 'Alice B'],
            ],
            'domus_tenancies' => [
                ['id' => 11, 'team_id' => 'a', 'unit_id' => 101, 'start_date' => '2020-01-01', 'end_date' => '2021-01-01', 'conditions' => 'Agreed conditions', 'base_rent' => '900', 'service_charge' => '100', 'deposit' => '2700', 'user_id' => 'PRIVATE OWNER'],
                ['id' => 22, 'team_id' => 'b', 'unit_id' => 202, 'start_date' => '2021-01-01', 'end_date' => null],
            ],
            'domus_partner_rel' => [
                ['team_id' => 'a', 'partner_id' => 1, 'type' => 'tenancy', 'relation_id' => 11],
                ['team_id' => 'a', 'partner_id' => 2, 'type' => 'tenancy', 'relation_id' => 11],
                ['team_id' => 'b', 'partner_id' => 3, 'type' => 'tenancy', 'relation_id' => 22],
            ],
            'domus_units' => [['id' => 101, 'team_id' => 'a', 'label' => 'Home A', 'notes' => 'PRIVATE UNIT'], ['id' => 202, 'team_id' => 'b', 'label' => 'Home B']],
            'domus_docLinks' => [
                ['id' => 51, 'team_id' => 'a', 'entity_type' => 'tenancy', 'entity_id' => 11, 'file_id' => 501, 'user_id' => 'staff', 'file_name' => 'Contract.pdf', 'note' => 'PRIVATE NOTE', 'created_at' => 1],
                ['id' => 52, 'team_id' => 'a', 'entity_type' => 'unit', 'entity_id' => 101, 'file_id' => 501, 'user_id' => 'staff'],
                ['id' => 53, 'team_id' => 'b', 'entity_type' => 'tenancy', 'entity_id' => 22, 'file_id' => 502, 'user_id' => 'staff-b', 'file_name' => 'Other.pdf', 'created_at' => 1],
            ],
        ];
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('actorUserId')->willReturnCallback(function () {
            if (!$this->enabled) throw new \DomainException('Disabled');
            return $this->actor;
        });
        $access->method('assertSubmittedTeam')->willReturnCallback(function ($team) {
            if ($this->actor !== 'staff' || $team !== 'a') throw new \DomainException('Denied');
        });
        $teams = $this->createMock(TeamIntegrationService::class);
        $teams->method('isTeamMember')->willReturnCallback(fn ($team, $uid) => $this->staffMember && $team === 'a' && $uid === 'staff');
        $teams->method('assertTeamAdmin')->willReturnCallback(function ($team) {
            if ($this->actor !== 'staff' || $team !== 'a' || !$this->staffMember) throw new \DomainException('Denied');
        });
        $staff = $this->createMock(IUser::class);
        $staff->method('getUID')->willReturn('staff'); $staff->method('isEnabled')->willReturn(true);
        $users = $this->createMock(IUserManager::class); $users->method('get')->willReturnCallback(fn ($uid) => $uid === 'staff' ? $staff : null);
        $file = $this->createMock(File::class); $file->method('isReadable')->willReturnCallback(fn () => $this->readable); $file->method('getName')->willReturn('Contract.pdf');
        $folder = $this->createMock(Folder::class); $folder->method('getById')->willReturnCallback(fn ($id) => $this->fileExists && $id === 501 ? [$file] : []);
        $files = $this->createMock(IRootFolder::class); $files->method('getUserFolder')->willReturn($folder);
        $urls = $this->createMock(IURLGenerator::class); $urls->method('linkToRoute')->willReturnCallback(fn ($route, $params) => '/renter/documents/' . $params['id']);
        $this->service = new RenterPortalService(new RenterPortalMapper($this->db), new RenterAccessMapper($this->db, $l10n), $access, $teams, $files, $users, $urls, $l10n);
    }

    private function denied(callable $action): void {
        try { $action(); self::fail('Expected denial'); } catch (\DomainException) { self::assertTrue(true); }
    }

    public function testSerializesOwnContactsAgreedChargesAndOnlyTenancyDocuments(): void {
        $data = $this->service->detail('a', 11);
        self::assertSame('900', $data['tenancy']['baseRent']);
        self::assertSame('Agreed conditions', $data['tenancy']['conditions']);
        self::assertSame([1], array_column($data['contacts'], 'id'));
        self::assertSame([51], array_column($data['documents'], 'id'));
        self::assertStringNotContainsString('PRIVATE', json_encode($data));
        self::assertStringNotContainsString('linkedEntities', json_encode($data));
        self::assertSame(['id', 'fileName', 'fileUrl', 'createdAt'], array_keys($data['documents'][0]));
        self::assertSame('Home B', $this->service->detail('b', 22)['tenancy']['unitLabel']);
        $this->actor = 'other-renter';
        self::assertSame([2], array_column($this->service->detail('a', 11)['contacts'], 'id'));
        $this->denied(fn () => $this->service->detail('b', 22));
        $this->denied(fn () => $this->service->content(53));
        $this->denied(fn () => $this->service->content(52));
    }

    public function testEveryDetailListAndDownloadChecksCurrentRelationsAndAccount(): void {
        self::assertInstanceOf(File::class, $this->service->content(51));
        $this->db->tables['domus_partners'][0]['nc_user_id'] = '';
        $this->denied(fn () => $this->service->detail('a', 11));
        $this->denied(fn () => $this->service->documents('a', 11));
        $this->denied(fn () => $this->service->content(51));
        $this->db->tables['domus_partners'][0]['nc_user_id'] = 'renter';
        $this->db->tables['domus_units'][0]['team_id'] = 'b';
        $this->denied(fn () => $this->service->detail('a', 11));
        $this->denied(fn () => $this->service->content(51));
        $this->enabled = false;
        $this->denied(fn () => $this->service->documents('b', 22));
    }

    public function testMissingFilesPermissionChangesAndFormerStaffFailClosed(): void {
        foreach (['fileExists', 'readable', 'staffMember'] as $flag) {
            $this->$flag = false;
            self::assertSame([], $this->service->documents('a', 11));
            $this->denied(fn () => $this->service->content(51));
            $this->$flag = true;
        }
        $this->db->tables['domus_docLinks'][0]['entity_id'] = 22;
        self::assertSame([], $this->service->documents('a', 11));
        $this->denied(fn () => $this->service->content(51));
    }

    public function testCorrectionsRequireReviewAndPreserveOriginalValues(): void {
        $request = $this->service->requestCorrection('a', 1, ['phone' => '123', 'email' => 'new@example.test']);
        self::assertArrayNotHasKey('phone', $this->db->tables['domus_partners'][0]);
        self::assertSame('pending', $request['state']);
        $this->denied(fn () => $this->service->decide('a', $request['id'], true));
        $this->actor = 'staff';
        $history = $this->service->corrections('a', 1);
        self::assertSame(['phone' => null, 'email' => 'alice@example.test'], $history[0]['original']);
        self::assertSame(['state' => 'approved'], $this->service->decide('a', $request['id'], true));
        self::assertSame('123', $this->db->tables['domus_partners'][0]['phone']);
        self::assertSame('staff', $this->db->tables['domus_corrections'][0]['decided_by']);
        $this->denied(fn () => $this->service->decide('a', $request['id'], false));
        $this->actor = 'renter';
        $detail = $this->service->detail('a', 11);
        self::assertSame([], $detail['corrections']);
        self::assertCount(1, $detail['activities']);
        self::assertSame('Contact correction approved', $detail['activities'][0]['title']);
        self::assertStringContainsString('alice@example.test → new@example.test', $detail['activities'][0]['data']);
        self::assertSame('staff', $this->db->tables['domus_action_logs'][0]['created_by']);
        self::assertSame('partner', $this->db->tables['domus_action_logs'][0]['entity_type']);
        self::assertSame(1, $this->db->tables['domus_action_logs'][0]['entity_id']);
        $this->actor = 'staff';
        self::assertSame([], $this->service->corrections('a', 1));
        self::assertSame($detail['activities'], $this->service->preview('a', 11, 1)['activities']);
    }

    public function testConflictsAndRejectedRequestsNeverOverwriteMasterData(): void {
        $request = $this->service->requestCorrection('a', 1, ['name' => 'Alice new', 'email' => 'new@example.test']);
        $this->db->tables['domus_partners'][0]['email'] = 'staff-change@example.test';
        $this->actor = 'staff';
        self::assertSame(['state' => 'conflict'], $this->service->decide('a', $request['id'], true));
        self::assertSame('Alice', $this->db->tables['domus_partners'][0]['name']);
        self::assertSame('staff-change@example.test', $this->db->tables['domus_partners'][0]['email']);
        $this->actor = 'renter';
        $second = $this->service->requestCorrection('a', 1, ['name' => 'Another']);
        $this->actor = 'staff';
        self::assertSame(['state' => 'rejected'], $this->service->decide('a', $second['id'], false));
        self::assertCount(2, $this->db->tables['domus_action_logs']);
        self::assertSame('Contact correction rejected', $this->db->tables['domus_action_logs'][1]['title']);
        self::assertStringContainsString('could not be applied', $this->db->tables['domus_action_logs'][0]['title']);
        self::assertSame('Alice', $this->db->tables['domus_partners'][0]['name']);
    }

    public function testCorrectionsCannotChangeIdentityOrOtherRentersAndStopAfterUnlink(): void {
        $this->denied(fn () => $this->service->requestCorrection('a', 2, ['name' => 'Forged']));
        $this->denied(fn () => $this->service->requestCorrection('wrong', 1, ['name' => 'Forged']));
        try { $this->service->requestCorrection('a', 1, ['nc_user_id' => 'forged']); self::fail(); }
        catch (\InvalidArgumentException) { self::assertTrue(true); }
        $request = $this->service->requestCorrection('a', 1, ['name' => 'New name']);
        $this->db->tables['domus_partners'][0]['nc_user_id'] = '';
        $this->actor = 'staff';
        $this->denied(fn () => $this->service->decide('a', $request['id'], true));
        $this->actor = 'other-renter';
        self::assertSame([], $this->service->detail('a', 11)['corrections']);
    }

    public function testApprovalCannotRaceWithAccountUnlinkAndFieldLimitsMatchTheSchema(): void {
        $request = $this->service->requestCorrection('a', 1, ['phone' => 'New phone']);
        $row = $this->db->tables['domus_corrections'][0];
        $this->db->tables['domus_partners'][0]['nc_user_id'] = '';
        $mapper = new RenterPortalMapper($this->db);
        self::assertSame('conflict', $mapper->decide($row, ['phone' => null], ['phone' => 'New phone'], 'staff', true, static function () {}));
        self::assertArrayNotHasKey('phone', $this->db->tables['domus_partners'][0]);
        $this->db->tables['domus_partners'][0]['nc_user_id'] = 'renter';
        foreach ([['zip' => str_repeat('x', 33)], ['name' => str_repeat('x', 191)], ['name' => ''], ['email' => 'invalid']] as $proposed) {
            try { $this->service->requestCorrection('a', 1, $proposed); self::fail('Invalid field accepted'); }
            catch (\InvalidArgumentException) { self::assertTrue(true); }
        }
    }

    public function testTeamPreviewUsesSameFieldsAndRequiresStaffContext(): void {
        $this->denied(fn () => $this->service->preview('a', 11, 1));
        $this->actor = 'staff';
        $data = $this->service->preview('a', 11, 1);
        self::assertSame([1], array_column($data['contacts'], 'id'));
        self::assertStringNotContainsString('PRIVATE', json_encode($data));
        $this->denied(fn () => $this->service->preview('a', 11, 3));
        $this->denied(fn () => $this->service->preview('b', 22, 3));
    }

    public function testRenterActivitiesExcludeInternalOtherTeamAndPreviousAccountEntries(): void {
        $request = $this->service->requestCorrection('a', 1, ['phone' => '123']);
        $this->actor = 'staff';
        $this->service->decide('a', $request['id'], false);
        $entry = $this->db->tables['domus_action_logs'][0];
        foreach ([['source' => 'manual'], ['team_id' => 'b'], ['entity_id' => 2], ['linked_entity_type' => 'unit']] as $override) {
            $this->db->tables['domus_action_logs'][] = array_replace($entry, $override, ['id' => 200, 'data' => 'PRIVATE']);
        }
        $this->actor = 'renter';
        $detail = $this->service->detail('a', 11);
        self::assertCount(1, $detail['activities']);
        self::assertStringNotContainsString('PRIVATE', json_encode($detail));
        self::assertArrayNotHasKey('createdBy', $detail['activities'][0]);
        $this->actor = 'other-renter';
        self::assertSame([], $this->service->detail('a', 11)['activities']);
        $this->db->tables['domus_partners'][0]['nc_user_id'] = 'replacement';
        $this->actor = 'replacement';
        self::assertSame([], $this->service->detail('a', 11)['activities']);
    }

    public function testActivityFailureRollsBackDecisionAndContactChange(): void {
        $this->service->requestCorrection('a', 1, ['name' => 'Changed']);
        $mapper = new RenterPortalMapper($this->db);
        $request = $this->db->tables['domus_corrections'][0];
        try {
            $mapper->decide($request, ['name' => 'Alice'], ['name' => 'Changed'], 'staff', true, function () use ($mapper) {
                $mapper->insert('domus_action_logs', ['title' => 'Rolled back']);
                throw new \RuntimeException('Activity write failed');
            });
            self::fail('Expected activity failure');
        } catch (\RuntimeException $e) {
            self::assertSame('Activity write failed', $e->getMessage());
        }
        self::assertSame('pending', $this->db->tables['domus_corrections'][0]['state']);
        self::assertSame('Alice', $this->db->tables['domus_partners'][0]['name']);
        self::assertSame([], $this->db->tables['domus_action_logs'] ?? []);
        self::assertSame(1, $this->db->rollbacks);
    }
}
