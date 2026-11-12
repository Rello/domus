<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Migration\FillDefaultAccountsRepairStep;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

class DefaultCatalogueInstallTest extends TestCase {
    public function testFreshInstallSeedsSharedDefaultsWithoutPersonalCopies(): void {
        $db = new TransferDatabase();
        $db->tables = ['domus_accounts' => [], 'domus_task_templates' => [], 'domus_task_tpl_steps' => []];
        $installer = new FillDefaultAccountsRepairStep($db);
        $output = $this->createMock(IOutput::class);
        $installer->run($output);
        self::assertCount(11, $db->tables['domus_accounts']);
        self::assertNotContains('2700', array_column($db->tables['domus_accounts'], 'number'));
        self::assertContains('2300', array_column($db->tables['domus_accounts'], 'number'));
        self::assertSame([1], array_values(array_unique(array_column($db->tables['domus_accounts'], 'is_system'))));
        self::assertCount(2, $db->tables['domus_task_templates']);
        self::assertCount(10, $db->tables['domus_task_tpl_steps']);
        self::assertSame(['system', 'system'], array_column($db->tables['domus_task_templates'], 'scope_key'));
        self::assertSame(['year_end', 'dunning'], array_column($db->tables['domus_task_templates'], 'key'));
        $templateIds = array_column($db->tables['domus_task_templates'], 'id');
        foreach ($db->tables['domus_task_tpl_steps'] as $step) {
            self::assertContains($step['template_id'], $templateIds);
        }
        $installed = $db->tables;
        $installer->run($output);
        self::assertSame($installed, $db->tables, 'Repeated installation must not duplicate defaults');
    }
    public function testLegacyCleanupMigrates2700To2300PreservingBookingsAndLinksOnRetry(): void {
        $db = new TransferDatabase();
        $db->tables = [
            'domus_accounts' => [
                ['id' => 1, 'number' => '2200', 'parent_id' => null],
                ['id' => 2, 'number' => '2700', 'parent_id' => null],
                ['id' => 3, 'number' => '2701', 'parent_id' => 2],
                ['id' => 4, 'number' => '2300', 'parent_id' => null],
                ['id' => 5, 'number' => '2700', 'parent_id' => null, 'scope_key' => 'team:a'],
            ],
            'domus_bookings' => [
                ['id' => 10, 'account' => 2700, 'source_property_booking_id' => null, 'team_id' => null, 'year' => 2024, 'amount' => '123.45', 'description' => 'Historic cost'],
                ['id' => 11, 'account' => 2700, 'source_property_booking_id' => 10, 'team_id' => 'team:a'],
                ['id' => 13, 'account' => 2300, 'source_property_booking_id' => null, 'team_id' => 'team:b'],
                ['id' => 14, 'account' => 2700, 'source_property_booking_id' => null, 'team_id' => 'team:b', 'amount' => '-50.00'],
                ['id' => 15, 'account' => 2701, 'source_property_booking_id' => null, 'team_id' => null],
                ['id' => 12, 'account' => 2200, 'source_property_booking_id' => null, 'team_id' => null],
            ],
            'domus_docLinks' => [['id' => 1, 'entity_type' => 'booking', 'entity_id' => 10]],
            'domus_action_logs' => [['id' => 1, 'entity_type' => 'booking', 'entity_id' => 10, 'linked_entity_type' => 'booking', 'linked_entity_id' => 11]],
        ];
        $db->tables['domus_task_templates'] = [];
        $db->tables['domus_task_tpl_steps'] = [];
        // Start with current templates so this test isolates account conversion.
        (new FillDefaultAccountsRepairStep($db))->run($this->createMock(IOutput::class));
        $db->tables['domus_task_steps'] = [];
        $expected = $db->tables;
        $expected['domus_accounts'] = [
            ['id' => 3, 'number' => '2701', 'parent_id' => null],
            ['id' => 4, 'number' => '2300', 'parent_id' => null],
        ];
        foreach ($expected['domus_bookings'] as &$booking) {
            if ($booking['account'] === 2700) $booking['account'] = 2300;
        }
        unset($booking);
        array_pop($expected['domus_bookings']);
        $migration = new \OCA\Domus\Migration\Version1003Date20261112000000($db, $this->createMock(\OCP\IUserManager::class), $this->createMock(\OCP\IGroupManager::class));
        $output = $this->createMock(IOutput::class);
        $migration->postSchemaChange($output, static fn() => null, []);
        self::assertSame($expected, $db->tables);
        $migration->postSchemaChange($output, static fn() => null, []);
        self::assertSame($expected, $db->tables);
    }
    public function testPopulatedCatalogueStillReceivesMissingSystemDefaults(): void {
        $db = new TransferDatabase();
        $existing = [
            ['id' => 1, 'key' => 'year_end', 'scope_key' => 'global', 'name' => 'Old test template'],
            ['id' => 2, 'key' => 'year_end', 'scope_key' => 'team:test', 'name' => 'Team template'],
            ['id' => 3, 'key' => 'custom', 'scope_key' => 'user:tester', 'name' => 'Personal template'],
        ];
        $db->tables = ['domus_accounts' => [['id' => 1]], 'domus_task_templates' => $existing,
            'domus_task_tpl_steps' => [['id' => 1, 'template_id' => 1, 'title' => 'Existing step']]];
        $installer = new FillDefaultAccountsRepairStep($db);
        $output = $this->createMock(IOutput::class);
        $installer->run($output);
        self::assertSame($existing, array_slice($db->tables['domus_task_templates'], 0, 3));
        self::assertSame(['system', 'system'], array_column(array_slice($db->tables['domus_task_templates'], 3), 'scope_key'));
        self::assertCount(11, $db->tables['domus_task_tpl_steps']);
        $once = $db->tables;
        $installer->run($output);
        self::assertSame($once, $db->tables);
    }
}
