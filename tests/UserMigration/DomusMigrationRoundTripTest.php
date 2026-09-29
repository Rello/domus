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
            'domus_task_steps' => [['id' => 23, 'workflow_run_id' => 19, 'entity_type' => 'unit', 'entity_id' => 5, 'allow_early_completion' => 1, 'closed_by' => 'source']],
            'domus_task_templates' => [['id' => 21, 'key' => 'custom', 'name' => 'Custom process']],
            'domus_task_tpl_steps' => [['id' => 25, 'template_id' => 21, 'title' => 'Custom step', 'allow_early_completion' => 1]],
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
        $this->assertSame(101, $db->tables['domus_task_tpl_steps'][0]['template_id']);
    }

    public function testLegacyArchiveReusesTemplateByKey(): void {
        $db = new TransferDatabase();
        $db->tables['domus_task_templates'] = [['id' => 77, 'key' => 'existing']];
        $payload = ['taskTemplates' => [['id' => 3, 'key' => 'existing']], 'units' => [['id' => 5, 'user_id' => 'source']],
            'workflowRuns' => [['id' => 9, 'template_id' => 3, 'entity_type' => 'unit', 'entity_id' => 5]]];
        $this->service($db)->import($this->user('target'), $this->source(json_encode($payload)), $this->createMock(OutputInterface::class));
        $this->assertSame(77, $db->tables['domus_workflow_runs'][0]['template_id']);
        $this->assertCount(1, $db->tables['domus_task_templates']);
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

    private function service(TransferDatabase $db, ?DocumentFiles $files = null): DomusMigrator {
        if ($files === null) {
            $files = $this->createMock(DocumentFiles::class);
            $files->method('import')->willReturn(['files' => [], 'folder' => null]);
        }
        return new DomusMigrator($db, $this->createMock(IConfig::class), $this->createMock(IL10N::class), $files);
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
