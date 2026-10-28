<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Migration\Version0008Date20261028000000;
use OCA\Domus\Migration\FillDefaultAccountsRepairStep;
use OCA\Domus\Tests\Support\{LegacyCatalogueFixture, TransferDatabase};
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCP\{IUserManager, IUser, IGroupManager};
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

class ConsolidatedMigrationTest extends TestCase {
    private function migrate(TransferDatabase $db): void {
        $users = $this->createMock(IUserManager::class);
        $users->method('get')->willReturnCallback(fn ($uid) => $uid === 'deleted' ? null : $this->createMock(IUser::class));
        $groups = $this->createMock(IGroupManager::class);
        $groups->method('isInGroup')->willReturnCallback(fn ($uid) => $uid === 'guest');
        (new Version0008Date20261028000000($db, $users, $groups))->postSchemaChange(
            $this->createMock(IOutput::class), static fn () => null, []);
    }

    public function testLegacyCustomizationsRemainVisibleAndIndependent(): void {
        $db = new TransferDatabase();
        $db->tables = LegacyCatalogueFixture::tables();
        $original = $db->tables;
        $this->migrate($db);
        foreach (['alice', 'bob'] as $uid) {
            $accounts = array_values(array_filter($db->tables['domus_accounts'], fn ($row) => $row['scope_key'] === 'user:' . $uid));
            self::assertCount(2, $accounts);
            $byNumber = array_column($accounts, null, 'number');
            self::assertSame($byNumber[2990]['id'], $byNumber[2991]['parent_id']);
            self::assertSame(1, $byNumber[2990]['parent_id']);
            self::assertSame('inactive', $byNumber[2990]['status']);
            self::assertSame('Eigene Kosten', $byNumber[2991]['label_de']);
            $context = $this->createMock(ManagementAccessContext::class);
            $context->method('activeTeamId')->willReturn(null);
            $context->method('legacyOwnerUserId')->willReturn($uid);
            $mapper = new class($db, $context) extends TaskTemplateMapper {
                protected function findEntities(mixed $query): array {
                    return array_map(static function ($row) {
                        $entity = new \OCA\Domus\Db\TaskTemplate();
                        foreach ($row as $key => $value) $entity->{'set' . str_replace(' ', '', ucwords(str_replace('_', ' ', $key)))}($value);
                        return $entity;
                    }, $query->executeQuery()->fetchAll());
                }
            };
            self::assertCount(3, $mapper->findAll());
            self::assertCount(2, $mapper->findAll(true));
            self::assertSame(0, $mapper->findByKey('year_end')->getIsActive());
            self::assertNotNull($mapper->findByKey('year_end')->getSystemTemplateId());
            self::assertSame('property', $mapper->findByKey('custom')->getAppliesTo());
            foreach ($mapper->findAll() as $template) {
                $steps = array_values(array_filter($db->tables['domus_task_tpl_steps'], fn ($step) => $step['template_id'] === $template->getId()));
                self::assertCount(1, $steps);
                self::assertSame(-3, $steps[0]['default_due_days_offset']);
                self::assertSame('https://example.com/custom', $steps[0]['action_url']);
                self::assertSame(1, $steps[0]['allow_early_completion']);
            }
        }
        foreach (['guest', 'deleted', 'team-only', 'new-user'] as $uid) {
            self::assertNotContains('user:' . $uid, array_column($db->tables['domus_task_templates'], 'scope_key'));
            self::assertNotContains('user:' . $uid, array_column($db->tables['domus_accounts'], 'scope_key'));
        }
        foreach (['domus_accounts', 'domus_task_templates', 'domus_task_tpl_steps'] as $table) {
            self::assertSame($original[$table], array_slice($db->tables[$table], 0, count($original[$table])));
        }
        self::assertSame($original['domus_bookings'], $db->tables['domus_bookings']);
        self::assertSame($original['domus_workflow_runs'], $db->tables['domus_workflow_runs']);
        self::assertSame($original['domus_task_steps'][0] + ['default_due_days_offset' => -3], $db->tables['domus_task_steps'][0]);
        $once = $db->tables;
        $this->migrate($db);
        (new FillDefaultAccountsRepairStep($db))->run($this->createMock(IOutput::class));
        self::assertSame($once, $db->tables, 'Retry and upgrade repair must not duplicate or overwrite rows');
    }

    public function testIndividualDefaultCustomizationsAreNotMistakenForBundledDefaults(): void {
        foreach ([
            ['template', 'name', 'My year end'],
            ['template', 'description', 'My instructions'],
            ['template', 'applies_to', 'property'],
            ['template', 'is_active', 0],
            ['step', 'title', 'My title'],
            ['step', 'description', 'My step instructions'],
            ['step', 'default_due_days_offset', 12],
            ['step', 'allow_early_completion', 1],
            ['step', 'action_type', 'booking'],
            ['step', 'action_url', 'https://example.com/custom'],
            ['step', 'sort_order', 10],
        ] as [$kind, $column, $value]) {
            $db = new TransferDatabase();
            $db->tables = ['domus_accounts' => [], 'domus_task_templates' => [], 'domus_task_tpl_steps' => []];
            (new FillDefaultAccountsRepairStep($db))->run($this->createMock(IOutput::class));
            foreach ($db->tables['domus_task_templates'] as &$template) $template['scope_key'] = 'global';
            unset($template);
            $table = $kind === 'template' ? 'domus_task_templates' : 'domus_task_tpl_steps';
            $db->tables[$table][0][$column] = $value;
            $db->tables['domus_units'] = [['user_id' => 'alice', 'team_id' => null]];
            $this->migrate($db);
            $copies = array_values(array_filter($db->tables['domus_task_templates'], fn ($row) => $row['scope_key'] === 'user:alice'));
            self::assertCount(1, $copies, $kind . '.' . $column);
            self::assertSame('year_end', $copies[0]['key']);
            if ($kind === 'template') {
                self::assertSame($value, $copies[0][$column]);
            } else {
                $steps = array_values(array_filter($db->tables['domus_task_tpl_steps'], fn ($row) => $row['template_id'] === $copies[0]['id']));
                self::assertSame($value, $steps[0][$column]);
            }
        }
    }

    public function testConflictsRollBackInsteadOfOverwritingEitherDefinition(): void {
        $db = new TransferDatabase();
        $db->tables = LegacyCatalogueFixture::tables();
        $db->tables['domus_accounts'][] = ['id' => 50, 'scope_key' => 'user:bob', 'number' => '2990', 'label_en' => 'Newer customization'];
        $before = $db->tables;
        try {
            $this->migrate($db);
            self::fail('Expected a conflict');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('migration conflict', $e->getMessage());
        }
        self::assertSame($before, $db->tables);
        self::assertSame(1, $db->rollbacks);
        array_pop($db->tables['domus_accounts']);
        $this->migrate($db);
        self::assertSame(1, $db->commits);
    }

    public function testUnchangedDefaultsUseSharedTemplatesAndFreshInstallAgrees(): void {
        $db = new TransferDatabase();
        $db->tables = ['domus_accounts' => [], 'domus_task_templates' => [], 'domus_task_tpl_steps' => []];
        $installer = new FillDefaultAccountsRepairStep($db);
        $installer->run($this->createMock(IOutput::class));
        foreach ($db->tables['domus_task_templates'] as &$template) $template['scope_key'] = 'global';
        unset($template);
        $db->tables['domus_units'] = [['user_id' => 'alice', 'team_id' => null]];
        $legacy = $db->tables;
        $this->migrate($db);
        self::assertNotContains('user:alice', array_column($db->tables['domus_task_templates'], 'scope_key'));
        $shared = array_values(array_filter($db->tables['domus_task_templates'], fn ($row) => $row['scope_key'] === 'system'));
        self::assertCount(2, $shared);
        foreach ($shared as $template) {
            $old = array_values(array_filter($legacy['domus_task_templates'], fn ($row) => $row['key'] === $template['key']))[0];
            self::assertSame($old['name'], $template['name']);
            $oldSteps = array_values(array_filter($legacy['domus_task_tpl_steps'], fn ($row) => $row['template_id'] === $old['id']));
            $newSteps = array_values(array_filter($db->tables['domus_task_tpl_steps'], fn ($row) => $row['template_id'] === $template['id']));
            foreach (['title', 'description', 'sort_order', 'default_due_days_offset', 'allow_early_completion', 'action_type', 'action_url'] as $column) {
                self::assertSame(array_column($oldSteps, $column), array_column($newSteps, $column));
            }
        }
    }
}
