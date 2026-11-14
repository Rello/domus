<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\FinancialHistoryMapper;
use OCA\Domus\Exception\{ConflictException, ResourceNotFoundException};
use OCA\Domus\Service\{AuditService, FinancialHistoryService, ManagementAccessContext, TeamPermissionService};
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class FinancialHistoryServiceTest extends TestCase {
    private TransferDatabase $db;
    private ManagementAccessContext $access;
    private FinancialHistoryMapper $mapper;
    private AuditService $audit;
    private IL10N $l10n;
    private FinancialHistoryService $service;

    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $owner = ['user_id' => 'alice', 'team_id' => null];
        $this->db->tables = [
            'domus_properties' => [['id' => 2, 'name' => 'House'] + $owner],
            'domus_units' => [['id' => 1, 'property_id' => 2, 'label' => 'Flat'] + $owner, ['id' => 9, 'property_id' => 2, 'label' => 'Shop'] + $owner],
            'domus_bookings' => [], 'domus_tenancies' => [], 'domus_docLinks' => [], 'domus_partner_rel' => [],
            'domus_action_logs' => [], 'domus_tasks' => [], 'domus_booking_years' => [], 'domus_rule_context' => [],
        ];
        foreach ([[10, 2022, 1], [11, 2024, 1], [12, 2021, 9]] as [$id, $year, $unitId]) {
            $this->db->tables['domus_bookings'][] = compact('id', 'year') + ['date' => "$year-12-31", 'amount' => '123.45',
                'unit_id' => $unitId, 'property_id' => 2, 'description' => 'Invoice', 'source_property_booking_id' => null] + $owner;
        }
        foreach ([[20, '2020-01-01', '2023-12-31'], [21, '2022-05-01', null], [22, '2024-01-01', null],
            [23, '2023-12-01', '2024-01-01']] as [$id, $start, $end]) {
            $this->db->tables['domus_tenancies'][] = ['id' => $id, 'unit_id' => 1, 'start_date' => $start,
                'end_date' => $end, 'conditions' => 'Original conditions', 'updated_at' => 1] + $owner;
        }
        foreach ([[30, 'booking', 10], [31, 'tenancy', 20], [32, 'unit', 1], [33, 'booking', 11]] as [$id, $type, $entity]) {
            $this->db->tables['domus_docLinks'][] = ['id' => $id, 'entity_type' => $type, 'entity_id' => $entity,
                'file_id' => 100, 'note' => 'Keep my note', 'document_date' => '2022-01-01'] + $owner;
        }
        $this->db->tables['domus_partner_rel'] = [['id' => 40, 'type' => 'tenancy', 'relation_id' => 20, 'partner_id' => 99] + $owner];
        $this->db->tables['domus_action_logs'] = [['id' => 50, 'entity_type' => 'unit', 'entity_id' => 1,
            'linked_entity_type' => 'booking', 'linked_entity_id' => 10] + $owner];
        $this->db->tables['domus_tasks'] = [['id' => 60, 'team_id' => null, 'entity_type' => 'unit', 'entity_id' => 1, 'rule_tenancy_id' => 20, 'status' => 'open']];
        $this->db->tables['domus_booking_years'] = [['id' => 70, 'team_id' => null, 'unit_id' => 1, 'property_id' => null, 'year' => 2022],
            ['id' => 71, 'team_id' => null, 'unit_id' => 1, 'property_id' => null, 'year' => 2024]];
        $this->db->tables['domus_rule_context'] = [['entity_type' => 'rentReview.tenancy', 'entity_id' => 20, 'data' => '{}']];
        $this->access = $this->createMock(ManagementAccessContext::class);
        $this->access->method('managementUserId')->willReturn('alice');
        $this->access->method('legacyOwnerUserId')->willReturn('alice');
        $this->l10n = $this->createMock(IL10N::class);
        $this->l10n->method('t')->willReturnCallback(static fn($text, $params = []) => $params ? vsprintf($text, $params) : $text);
        $this->mapper = new FinancialHistoryMapper($this->db, $this->access, $this->l10n);
        $this->audit = $this->createMock(AuditService::class);
        $this->service = new FinancialHistoryService($this->mapper, $this->access, $this->l10n, $this->audit);
    }

    public function testPreviewIsReadOnlyAndShowsExactCutoffAndNotes(): void {
        $before = $this->db->tables;
        $preview = $this->service->preview(2024, 1, null);
        self::assertSame($before, $this->db->tables);
        self::assertSame([10], array_column($preview['bookings'], 'id'));
        self::assertSame([20], array_column($preview['deleteTenancies'], 'id'));
        self::assertSame([21, 23], array_column($preview['adjustTenancies'], 'id'));
        self::assertSame('2024-01-01', $preview['adjustTenancies'][1]['newStartDate']);
        self::assertStringContainsString('2022-05-01 to 2024-01-01', $preview['adjustTenancies'][0]['note']);
        self::assertSame(2, $preview['preservedDocuments']);
        self::assertSame(1, $preview['removedClosures']);
        self::assertSame([], $preview['blockers']);
    }

    public function testRemovalPreservesDocumentsContactsAndLaterHistory(): void {
        $preview = $this->service->preview(2024, 1, null);
        $documents = $this->db->tables['domus_docLinks'];
        $this->audit->expects(self::once())->method('record')->with('financial_history.deleted', 1, 'alice', null, self::anything());
        $this->service->remove(2024, 1, null, $preview['token']);
        self::assertSame([11, 12], array_column($this->db->tables['domus_bookings'], 'id'));
        self::assertSame([21, 22, 23], array_column($this->db->tables['domus_tenancies'], 'id'));
        $tenancy = $this->db->tables['domus_tenancies'][0];
        self::assertSame('2024-01-01', $tenancy['start_date']);
        self::assertSame('Original conditions' . "\n\n" . $preview['adjustTenancies'][0]['note'], $tenancy['conditions']);
        self::assertSame('2024-01-01', $this->db->tables['domus_tenancies'][1]['start_date']);
        foreach ([0, 1] as $index) {
            $documents[$index]['entity_type'] = 'unit'; $documents[$index]['entity_id'] = 1;
        }
        self::assertSame($documents, $this->db->tables['domus_docLinks']);
        self::assertSame([], $this->db->tables['domus_partner_rel']);
        self::assertSame([], $this->db->tables['domus_action_logs']);
        self::assertSame([], $this->db->tables['domus_rule_context']);
        self::assertSame('closed', $this->db->tables['domus_tasks'][0]['status']);
        self::assertNull($this->db->tables['domus_tasks'][0]['rule_tenancy_id']);
        self::assertSame([71], array_column($this->db->tables['domus_booking_years'], 'id'));
        self::assertSame(1, $this->db->commits);
        self::assertFalse($this->service->preview(2024, 1, null)['hasChanges']);
    }

    /** @dataProvider staleChanges */
    public function testChangedPreviewCannotDeleteAnything(string $table, string $column, mixed $value): void {
        $preview = $this->service->preview(2024, 1, null);
        $this->db->tables[$table][0][$column] = $value;
        $before = $this->db->tables;
        try {
            $this->service->remove(2024, 1, null, $preview['token']);
            self::fail('Expected stale preview rejection');
        } catch (ConflictException $e) { self::assertStringContainsString('new preview', $e->getMessage()); }
        self::assertSame($before, $this->db->tables);
        self::assertSame(1, $this->db->rollbacks);
    }

    public static function staleChanges(): array {
        return [['domus_bookings', 'amount', '999'], ['domus_docLinks', 'note', 'Changed'], ['domus_tenancies', 'conditions', 'Changed']];
    }

    public function testMissingPreviewTokenIsRejected(): void {
        $this->expectException(ConflictException::class);
        $this->service->remove(2024, 1, null, '');
    }

    public function testPartialDistributionBlockedAndWholePropertyRemovesSourceAndShares(): void {
        $owner = ['user_id' => 'alice', 'team_id' => null];
        $this->db->tables['domus_bookings'][] = ['id' => 13, 'year' => 2022, 'date' => '2022-01-01', 'amount' => '250',
            'unit_id' => null, 'property_id' => 2, 'distribution_key_id' => 8] + $owner;
        $this->db->tables['domus_bookings'][0]['source_property_booking_id'] = 13;
        $this->db->tables['domus_docLinks'][] = ['id' => 34, 'entity_type' => 'booking', 'entity_id' => 13, 'file_id' => 101] + $owner;
        $unitPreview = $this->service->preview(2024, 1, null);
        self::assertNotEmpty($unitPreview['blockers']);
        try { $this->service->remove(2024, 1, null, $unitPreview['token']); self::fail('Expected blocker'); }
        catch (ConflictException $e) { self::assertStringContainsString('whole property', $e->getMessage()); }
        $propertyPreview = $this->service->preview(2024, null, 2);
        self::assertSame([], $propertyPreview['blockers']);
        self::assertSame(2, $propertyPreview['unitCount']);
        $this->service->remove(2024, null, 2, $propertyPreview['token']);
        self::assertSame([11], array_column($this->db->tables['domus_bookings'], 'id'));
        self::assertSame('property', $this->db->tables['domus_docLinks'][4]['entity_type']);
        self::assertSame(2, $this->db->tables['domus_docLinks'][4]['entity_id']);
    }

    public function testRollbackRestoresDatesDocumentsAndDependenciesAfterFailure(): void {
        $preview = $this->service->preview(2024, 1, null);
        $before = $this->db->tables;
        $mapper = $this->getMockBuilder(FinancialHistoryMapper::class)->setConstructorArgs([$this->db, $this->access, $this->l10n])->onlyMethods(['change'])->getMock();
        $mapper->method('change')->willReturnCallback(function ($table, $row, $values, $userId, $owned = true) {
            if ($table === 'domus_bookings' && $values === []) throw new \RuntimeException('Injected failure');
            $this->mapper->change($table, $row, $values, $userId, $owned);
        });
        $this->audit->expects(self::never())->method('record');
        $service = new FinancialHistoryService($mapper, $this->access, $this->l10n, $this->audit);
        try { $service->remove(2024, 1, null, $preview['token']); self::fail('Expected failure'); }
        catch (\RuntimeException $e) { self::assertSame('Injected failure', $e->getMessage()); }
        self::assertSame($before, $this->db->tables);
        self::assertSame(1, $this->db->rollbacks);
    }

    /** @dataProvider invalidScopes */
    public function testInvalidCutoffOrScopeRejected(int $year, ?int $unitId, ?int $propertyId): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->service->preview($year, $unitId, $propertyId);
    }

    public static function invalidScopes(): array { return [[1899, 1, null], [10000, 1, null], [2024, null, null], [2024, 1, 2], [2024, 0, null]]; }

    public function testFutureAvailableYearCanBeRetained(): void {
        $year = (int)date('Y') + 1;
        $preview = $this->service->preview($year, 1, null);
        self::assertSame($year . '-01-01', $preview['cutoff']);
    }

    public function testUnauthorizedParentAndOtherScopesAreProtected(): void {
        $this->db->tables['domus_units'][0]['user_id'] = 'bob';
        $this->expectException(ResourceNotFoundException::class);
        $this->service->preview(2024, 1, null);
    }

    public function testTeamCleanupOnlyChangesTheSelectedTeam(): void {
        foreach (['domus_properties', 'domus_units', 'domus_bookings', 'domus_tenancies', 'domus_docLinks', 'domus_partner_rel', 'domus_action_logs', 'domus_tasks', 'domus_booking_years'] as $table) {
            foreach ($this->db->tables[$table] as &$row) $row['team_id'] = 'team-a';
            unset($row);
        }
        $this->db->tables['domus_bookings'][] = ['id' => 90, 'unit_id' => 1, 'year' => 2020, 'team_id' => 'team-b', 'user_id' => 'alice'];
        $this->db->tables['domus_bookings'][] = ['id' => 91, 'unit_id' => 1, 'year' => 2020, 'team_id' => null, 'user_id' => 'alice'];
        $this->access->method('activeTeamId')->willReturn('team-a');
        $preview = $this->service->preview(2024, 1, null);
        $this->service->remove(2024, 1, null, $preview['token']);
        self::assertSame([11, 12, 90, 91], array_column($this->db->tables['domus_bookings'], 'id'));
    }

    public function testPermissionRequiredForBothEndpoints(): void {
        self::assertSame('deleteRecords', TeamPermissionService::required('FinancialHistory', 'preview', 'POST'));
        self::assertSame('deleteRecords', TeamPermissionService::required('FinancialHistory', 'remove', 'POST'));
        $this->access->method('assertCapability')->willThrowException(new \DomainException('Denied'));
        $this->expectException(\DomainException::class);
        $this->service->remove(2024, 1, null, 'anything');
    }

    public function testPropertyClosuresCannotBeRemovedThroughOneUnit(): void {
        $this->db->tables['domus_booking_years'][] = ['id' => 72, 'team_id' => null, 'unit_id' => null, 'property_id' => 2, 'year' => 2023];
        self::assertNotEmpty($this->service->preview(2024, 1, null)['blockers']);
        $preview = $this->service->preview(2024, null, 2);
        self::assertSame([], $preview['blockers']);
        self::assertSame(2, $preview['removedClosures']);
        $this->service->remove(2024, null, 2, $preview['token']);
        self::assertSame([71], array_column($this->db->tables['domus_booking_years'], 'id'));
    }

    public function testPersonalCleanupCannotTouchOtherOwnersOrTeams(): void {
        $this->db->tables['domus_bookings'][] = ['id' => 90, 'unit_id' => 1, 'year' => 2020, 'team_id' => null, 'user_id' => 'bob'];
        $this->db->tables['domus_bookings'][] = ['id' => 91, 'unit_id' => 1, 'year' => 2020, 'team_id' => 'team-a', 'user_id' => 'alice'];
        $preview = $this->service->preview(2024, 1, null);
        $this->service->remove(2024, 1, null, $preview['token']);
        self::assertSame([11, 12, 90, 91], array_column($this->db->tables['domus_bookings'], 'id'));
    }

    public function testConditionsArePreservedExactlyAndOversizedNotesBlockCleanup(): void {
        $this->db->tables['domus_tenancies'][1]['conditions'] = "  Custom conditions\n";
        $preview = $this->service->preview(2024, 1, null);
        $this->service->remove(2024, 1, null, $preview['token']);
        self::assertSame("  Custom conditions\n\n\n" . $preview['adjustTenancies'][0]['note'], $this->db->tables['domus_tenancies'][0]['conditions']);
        $this->db->tables['domus_tenancies'][0]['start_date'] = '2020-01-01';
        $this->db->tables['domus_tenancies'][0]['conditions'] = str_repeat('x', 65535);
        self::assertNotEmpty($this->service->preview(2024, 1, null)['blockers']);
    }

    public function testAccountingYearControlsDeletionNotTheServicePeriod(): void {
        $this->db->tables['domus_bookings'][1]['delivery_date'] = '2022-12-31';
        $this->db->tables['domus_bookings'][1]['period_from'] = '2022-01-01';
        self::assertSame([10], array_column($this->service->preview(2024, 1, null)['bookings'], 'id'));
    }

    public function testConcurrentRecordChangeRejectsTheConditionalMutation(): void {
        $row = $this->db->tables['domus_bookings'][0];
        $this->db->tables['domus_bookings'][0]['amount'] = '999';
        $this->expectException(ConflictException::class);
        $this->mapper->change('domus_bookings', $row, [], 'alice');
    }

    public function testLargeHistoryUsesBatchedDependencyQueries(): void {
        for ($id = 100; $id < 1200; $id++) {
            $this->db->tables['domus_bookings'][] = ['id' => $id, 'unit_id' => 1, 'property_id' => 2, 'year' => 2021,
                'date' => '2021-12-31', 'amount' => '1.00', 'team_id' => null, 'user_id' => 'alice'];
        }
        $preview = $this->service->preview(2024, 1, null);
        self::assertCount(1101, $preview['bookings']);
        self::assertLessThan(30, array_sum($this->db->reads));
    }
}
