<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\UserMigration;

use OCA\Domus\Tests\Support\TransferDatabase;
use OCA\Domus\UserMigration\DocumentFiles;
use OCA\Domus\UserMigration\DomusMigrator;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IUser;
use OCP\UserMigration\IExportDestination;
use OCP\UserMigration\IImportSource;
use OCP\UserMigration\UserMigrationException;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Output\OutputInterface;

class DomusMigrationRoundTripTest extends TestCase {
    public function testMappedOwnerCannotExportThroughUserMigration(): void {
        $db = new TransferDatabase();
        $db->tables['domus_units'] = [['id' => 1, 'user_id' => 'source', 'team_id' => 'team-a']];
        $destination = $this->createMock(IExportDestination::class);
        $destination->expects($this->never())->method('addFileContents');

        $this->expectException(UserMigrationException::class);
        $this->service($db)->export($this->user('source'), $destination, $this->createMock(OutputInterface::class));
    }

    public function testMappedOwnerCannotImportIntoTeamPortfolioThroughUserMigration(): void {
        $db = new TransferDatabase();
        $db->tables['domus_units'] = [['id' => 1, 'user_id' => 'target', 'team_id' => 'team-a']];

        try {
            $this->service($db)->import($this->user('target'), $this->source('{}'), $this->createMock(OutputInterface::class));
            $this->fail('A mapped Team portfolio must reject user migration.');
        } catch (UserMigrationException $e) {
            $this->assertSame(0, $db->commits);
            $this->assertSame(1, $db->rollbacks);
            $this->assertStringContainsString('Team', $e->getPrevious()?->getMessage() ?? '');
        }
    }

    public function testSupportedArchiveVersions(): void {
        $service = $this->service(new TransferDatabase());
        $this->assertSame(3, $service->getVersion());
        foreach ([1 => true, 2 => true, 3 => true, 4 => false] as $version => $expected) {
            $source = $this->createMock(IImportSource::class);
            $source->expects($this->once())->method('getMigratorVersion')->with('domus')->willReturn($version);
            $this->assertSame($expected, $service->canImport($source));
        }
        $source = $this->createMock(IImportSource::class);
        $source->method('getMigratorVersion')->willReturn(null);
        $this->assertFalse($service->canImport($source));
    }

    public function testUserMigrationRoundTripPreservesActivityAndProcessesWithNewIds(): void {
        $db = new TransferDatabase();
        $db->tables = [
            'domus_units' => [['id' => 5, 'user_id' => 'source', 'label' => 'Unit', 'property_id' => null]],
            'domus_partners' => [['id' => 7, 'user_id' => 'source', 'name' => 'Partner']],
            'domus_tenancies' => [['id' => 9, 'user_id' => 'source', 'unit_id' => 5]],
            'domus_bookings' => [['id' => 11, 'user_id' => 'source', 'unit_id' => 5]],
            'domus_docLinks' => [['id' => 13, 'user_id' => 'source', 'entity_type' => 'unit', 'entity_id' => 5, 'file_id' => 15]],
            'domus_tasks' => [['id' => 17, 'created_by' => 'source', 'entity_type' => 'unit', 'entity_id' => 5, 'title' => 'Task', 'closed_by' => 'source']],
            'domus_workflow_runs' => [['id' => 19, 'created_by' => 'source', 'entity_type' => 'unit', 'entity_id' => 5, 'template_id' => 21, 'closed_by' => 'source']],
            'domus_task_steps' => [['id' => 23, 'sort_order' => 1, 'workflow_run_id' => 19, 'entity_type' => 'unit', 'entity_id' => 5, 'allow_early_completion' => 1, 'closed_by' => 'source']],
            'domus_task_templates' => [['id' => 21, 'key' => 'custom', 'name' => 'Custom process']],
            'domus_task_tpl_steps' => [['id' => 25, 'sort_order' => 1, 'default_due_days_offset' => 8, 'template_id' => 21, 'title' => 'Custom step', 'allow_early_completion' => 1]],
        ];
        $links = ['document' => 13, 'partner' => 7, 'tenancy' => 9, 'booking' => 11, 'unit' => 5, 'property' => 99];
        foreach ($links as $type => $id) {
            $db->tables['domus_action_logs'][] = [
                'id' => count($db->tables['domus_action_logs'] ?? []) + 30,
                'user_id' => 'source', 'entity_type' => 'unit', 'entity_id' => 5,
                'type' => 'note', 'title' => $type, 'data' => 'History', 'source' => 'system',
                'linked_entity_type' => $type, 'linked_entity_id' => $id, 'linked_label' => 'Original label',
                'created_by' => 'source', 'created_at' => 123, 'updated_at' => 124,
            ];
        }
        $db->tables['domus_action_logs'][] = ['id' => 90, 'user_id' => 'other', 'entity_type' => 'unit', 'entity_id' => 99];
        $files = $this->createMock(DocumentFiles::class);
        $files->method('export')->willReturn([15 => 'document.pdf']);
        $files->method('import')->willReturn(['files' => [15 => 115], 'folder' => null]);
        $service = $this->service($db, $files);
        $destination = $this->createMock(IExportDestination::class);
        $archive = '';
        $destination->expects($this->once())->method('addFileContents')->with('domus/user-data.json', $this->callback(function ($contents) use (&$archive) {
            $archive = $contents;
            return true;
        }));
        $output = $this->createMock(OutputInterface::class);
        $service->export($this->user('source'), $destination, $output);
        $payload = json_decode($archive, true);
        $this->assertCount(6, $payload['actionLogs']);
        $this->assertCount(1, $payload['taskTemplateSteps']);
        // Destination deliberately has an unrelated template at the old ID.
        $db->tables = ['domus_task_templates' => [['id' => 21, 'key' => 'unrelated']]];
        $service->import($this->user('target'), $this->source($archive), $output);
        $this->assertSame(1, $db->commits);
        $this->assertSame(0, $db->rollbacks);
        $this->assertSame(115, $db->tables['domus_docLinks'][0]['file_id']);
        foreach ($db->tables['domus_action_logs'] as $entry) {
            $this->assertSame('target', $entry['user_id']);
            $this->assertSame('target', $entry['created_by']);
            $this->assertSame(101, $entry['entity_id']);
            $this->assertSame('History', $entry['data']);
            $this->assertSame(123, $entry['created_at']);
            $this->assertSame(124, $entry['updated_at']);
            $this->assertSame('system', $entry['source']);
            if ($entry['title'] === 'property') {
                $this->assertNull($entry['linked_entity_type']);
                $this->assertNull($entry['linked_entity_id']);
                $this->assertSame('Original label', $entry['linked_label']);
            } else {
                $this->assertSame($entry['title'], $entry['linked_entity_type']);
                $this->assertSame(101, $entry['linked_entity_id']);
            }
        }
        $this->assertSame(101, $db->tables['domus_tasks'][0]['entity_id']);
        $this->assertSame('target', $db->tables['domus_tasks'][0]['closed_by']);
        $this->assertSame(101, $db->tables['domus_workflow_runs'][0]['template_id']);
        $this->assertSame('target', $db->tables['domus_workflow_runs'][0]['closed_by']);
        $this->assertSame(101, $db->tables['domus_task_steps'][0]['workflow_run_id']);
        $this->assertSame(1, $db->tables['domus_task_steps'][0]['allow_early_completion']);
        $this->assertSame(8, $db->tables['domus_task_steps'][0]['default_due_days_offset']);
        $this->assertSame(101, $db->tables['domus_task_tpl_steps'][0]['template_id']);
    }

    public function testLegacyArchiveReusesTemplateByKey(): void {
        $db = new TransferDatabase();
        $db->tables['domus_task_templates'] = [['id' => 77, 'key' => 'existing', 'scope_key' => 'user:target']];
        $payload = ['taskTemplates' => [['id' => 3, 'key' => 'existing']], 'units' => [['id' => 5, 'user_id' => 'source']],
            'workflowRuns' => [['id' => 9, 'template_id' => 3, 'entity_type' => 'unit', 'entity_id' => 5]]];
        $this->service($db)->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
        $this->assertSame(77, $db->tables['domus_workflow_runs'][0]['template_id']);
        $this->assertCount(1, $db->tables['domus_task_templates']);
    }

    public function testPersonalImportRejectsTeamRowsBeforeFilesOrSettingsAreWritten(): void {
        foreach ([
            ['units' => [['id' => 5, 'team_id' => 'team-a']]],
            ['taskTemplates' => [['id' => 3, 'key' => 'existing', 'scope_key' => 'team:a']]],
            ['taskSteps' => [['team_id' => 'team-b']]],
            ['bookingYears' => [['teamId' => 'team-b']]],
        ] as $payload) {
            $db = new TransferDatabase();
            $db->tables['domus_task_templates'] = [['id' => 77, 'key' => 'existing', 'scope_key' => 'user:target']];
            $files = $this->createMock(DocumentFiles::class);
            $files->expects($this->never())->method('import');
            $config = $this->createMock(IConfig::class);
            $config->expects($this->never())->method('setUserValue');
            $service = new DomusMigrator($db, $config, $this->l10n(), $files);
            try {
                $service->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
                $this->fail('Team markers must be rejected before any import side effects.');
            } catch (UserMigrationException $e) {
                $this->assertStringContainsString('Team', $e->getPrevious()->getMessage());
                $this->assertSame(0, $db->commits);
                $this->assertSame(0, $db->rollbacks);
                $this->assertCount(1, $db->tables['domus_task_templates']);
            }
        }
    }

    /** @dataProvider invalidNativeRows */
    public function testInvalidColumnsAreRejectedBeforeAnySideEffects(string $section, array $row): void {
        $db = new TransferDatabase();
        $files = $this->createMock(DocumentFiles::class);
        $files->expects(self::never())->method('import');
        $config = $this->createMock(IConfig::class);
        $config->expects(self::never())->method('setUserValue');
        $payload = ['settings' => ['taxRate' => '0.5'], $section => [$row]];
        $service = new DomusMigrator($db, $config, $this->l10n(), $files);
        try {
            $service->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
            self::fail('Noncanonical rows must not reach the SQL builder.');
        } catch (UserMigrationException $e) {
            self::assertSame([], $db->tables);
            self::assertSame(0, $db->commits);
            self::assertSame(0, $db->rollbacks);
        }
    }

    public static function invalidNativeRows(): array {
        $cases = [];
        foreach (['properties', 'units', 'partners', 'tenancies', 'distributionKeys', 'distributionKeyUnits',
            'bookings', 'partnerRelations', 'documentLinks', 'bookingYears', 'actionLogs', 'workflowRuns',
            'taskSteps', 'tasks', 'taskTemplates', 'taskTemplateSteps'] as $section) {
            $cases[$section] = [$section, ['id' => 1, 'TEAM_ID' => 'foreign-team']];
        }
        foreach (['Team_Id', 'teamId', 'team_id ', '`team_id`', '"team_id"', 'USER_ID', 'user_Id', 'unexpected'] as $column) {
            $cases[$column] = ['properties', ['id' => 1, 'team_id' => null, $column => 'foreign']];
        }
        $cases['scope alias'] = ['taskTemplates', ['id' => 1, 'key' => 'existing', 'SCOPE_KEY' => 'team:foreign']];
        $cases['scope case'] = ['taskTemplates', ['id' => 1, 'scope_key' => 'TEAM:foreign']];
        $cases['non-global scope'] = ['taskTemplates', ['id' => 1, 'scope_key' => 'other']];
        $cases['foreign catalogue'] = ['taskTemplates', ['id' => 1, 'source_catalogue_id' => 99]];
        $cases['nested column'] = ['units', ['id' => 1, 'label' => ['text' => 'not a database value']]];
        return $cases;
    }

    public function testPersonalOwnershipIsExplicitForCanonicalAndLegacyArchives(): void {
        $db = new TransferDatabase();
        $payload = ['properties' => [['id' => 1, 'user_id' => 'source', 'team_id' => null, 'image_file_id' => 55, 'image_file_name' => 'source.png']],
            'units' => [['id' => 2, 'user_id' => 'source', 'property_id' => 1, 'image_file_id' => 66, 'image_file_name' => 'private.pdf']],
            'taskTemplates' => [['id' => 3, 'key' => 'custom', 'scope_key' => 'global']],
            'taskTemplateSteps' => [['id' => 4, 'template_id' => 3, 'title' => 'Step']]];
        $this->service($db)->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
        foreach (['domus_properties', 'domus_units', 'domus_task_templates', 'domus_task_tpl_steps'] as $table) {
            self::assertArrayHasKey('team_id', $db->tables[$table][0]);
            self::assertNull($db->tables[$table][0]['team_id']);
        }
        foreach (['domus_properties', 'domus_units'] as $table) {
            self::assertNull($db->tables[$table][0]['image_file_id']);
            self::assertNull($db->tables[$table][0]['image_file_name']);
        }
        self::assertSame('target', $db->tables['domus_properties'][0]['user_id']);
        self::assertSame('target', $db->tables['domus_units'][0]['user_id']);
        self::assertSame('user:target', $db->tables['domus_task_templates'][0]['scope_key']);
        self::assertNull($db->tables['domus_task_templates'][0]['source_catalogue_id']);
    }

    public function testImportedPartnersRequireExplicitAccountRelinking(): void {
        $db = new TransferDatabase();
        $payload = ['partners' => [
            ['id' => 1, 'user_id' => 'source', 'nc_user_id' => 'source'],
            ['id' => 2, 'user_id' => 'source', 'nc_user_id' => 'renter'],
        ]];
        $this->service($db)->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
        $this->assertSame([null, null], array_column($db->tables['domus_partners'], 'nc_user_id'));
        $this->assertSame(['target', 'target'], array_column($db->tables['domus_partners'], 'user_id'));
    }

    public function testLegacyArchiveCannotReuseUnrelatedTemplateId(): void {
        $db = new TransferDatabase();
        $db->tables['domus_task_templates'] = [['id' => 3, 'key' => 'unrelated']];
        $payload = ['taskTemplates' => [['id' => 3, 'key' => 'missing']]];
        try {
            $this->service($db)->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
            $this->fail('Missing template steps must prevent import.');
        } catch (UserMigrationException $e) {
            $this->assertStringContainsString('Export it again', $e->getPrevious()->getMessage());
            $this->assertSame(1, $db->rollbacks);
            $this->assertSame(0, $db->commits);
            $this->assertCount(1, $db->tables['domus_task_templates']);
        }
    }

    private function l10n(): IL10N {
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(static fn(string $text, array $parameters = []) => vsprintf($text, $parameters));
        return $l10n;
    }

    private function service(TransferDatabase $db, ?DocumentFiles $files = null): DomusMigrator {
        if ($files === null) {
            $files = $this->createMock(DocumentFiles::class);
            $files->method('import')->willReturn(['files' => [], 'folder' => null]);
        }
        $l10n = $this->l10n();
        $l10n->method('t')->willReturnArgument(0);
        return new DomusMigrator($db, $this->createMock(IConfig::class), $l10n, $files);
    }
    private function user(string $uid): IUser {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn($uid);
        return $user;
    }
    private function source(string $archive): IImportSource {
        $source = $this->createMock(IImportSource::class);
        $source->method('pathExists')->willReturn(true);
        $source->method('getFileContents')->willReturn($archive);
        return $source;
    }
}
