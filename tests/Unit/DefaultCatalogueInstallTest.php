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
        self::assertCount(13, $db->tables['domus_accounts']);
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
