<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\FinancialHistoryMapper;
use OCA\Domus\Db\RenterPortalMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class ScopedRawMapperTest extends TestCase {
    private TransferDatabase $db;
    private RenterPortalMapper $portal;

    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $this->db->tables['domus_partners'] = [
            ['id' => 1, 'team_id' => 'a', 'name' => 'Alice'],
            ['id' => 2, 'team_id' => 'b', 'name' => 'Bob'],
        ];
        $this->db->tables['domus_doclinks'] = [
            ['id' => 5, 'team_id' => 'a', 'entity_type' => 'tenancy', 'entity_id' => 11],
            ['id' => 6, 'team_id' => null, 'entity_type' => 'tenancy', 'entity_id' => 11],
            ['id' => 7, 'team_id' => 'a', 'entity_type' => 'unit', 'entity_id' => 3],
        ];
        $this->portal = new RenterPortalMapper($this->db);
    }

    /** @dataProvider unscopedPortalAccess */
    public function testPortalAccessWithoutATeamIsRejected(callable $access, string $message): void {
        try {
            $access($this->portal);
            self::fail('Unscoped renter portal access was accepted');
        } catch (\LogicException $e) {
            self::assertStringContainsString($message, $e->getMessage());
        }
        self::assertSame('Alice', $this->db->tables['domus_partners'][0]['name']);
        self::assertSame('Bob', $this->db->tables['domus_partners'][1]['name']);
        self::assertCount(2, $this->db->tables['domus_partners']);
    }

    public static function unscopedPortalAccess(): array {
        return [
            'read without team' => [fn(RenterPortalMapper $m) => $m->rows('domus_partners', ['id' => 2]), 'must be limited to a Team'],
            'read with empty team' => [fn(RenterPortalMapper $m) => $m->rows('domus_partners', ['team_id' => '', 'id' => 2]), 'must be limited to a Team'],
            'update without team' => [fn(RenterPortalMapper $m) => $m->update('domus_partners', ['id' => 2], ['name' => 'Changed']), 'must be limited to a Team'],
            'insert without team' => [fn(RenterPortalMapper $m) => $m->insert('domus_partners', ['name' => 'Mallory']), 'must be limited to a Team'],
            'move to another team' => [fn(RenterPortalMapper $m) => $m->update('domus_partners', ['team_id' => 'b', 'id' => 2], ['team_id' => 'a']), 'cannot move rows'],
            'table outside the portal' => [fn(RenterPortalMapper $m) => $m->rows('domus_bookings', ['team_id' => 'a']), 'not available to the renter portal'],
        ];
    }

    public function testScopedPortalAccessStaysWithinItsTeam(): void {
        self::assertSame([1], array_column($this->portal->rows('domus_partners', ['team_id' => 'a']), 'id'));
        self::assertSame(0, $this->portal->update('domus_partners', ['team_id' => 'a', 'id' => 2], ['name' => 'Changed']));
        self::assertSame('Bob', $this->db->tables['domus_partners'][1]['name']);
    }

    public function testDocumentLinkByIdOnlyReturnsTeamTenancyLinks(): void {
        self::assertSame(5, $this->portal->tenancyDocumentLink(5)['id']);
        self::assertNull($this->portal->tenancyDocumentLink(6), 'Personal links have no renter portal Team');
        self::assertNull($this->portal->tenancyDocumentLink(7), 'Unit links are not renter documents');
        self::assertNull($this->portal->tenancyDocumentLink(99));
    }

    public function testFinancialHistoryOnlyTouchesItsCleanupTables(): void {
        $access = $this->createMock(ManagementAccessContext::class);
        $mapper = new FinancialHistoryMapper($this->db, $access, $this->createMock(IL10N::class));
        foreach ([
            fn() => $mapper->rows('domus_partners', ['id' => 1], 'alice'),
            fn() => $mapper->change('domus_partners', ['id' => 1], [], 'alice'),
            fn() => $mapper->lockScope('domus_partners', 1, 'alice'),
        ] as $access) {
            try {
                $access();
                self::fail('A table outside the cleanup was accepted');
            } catch (\LogicException $e) {
                self::assertStringContainsString('not part of the financial history cleanup', $e->getMessage());
            }
        }
        self::assertCount(2, $this->db->tables['domus_partners']);
    }
}
