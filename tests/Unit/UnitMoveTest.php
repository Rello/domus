<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Unit;
use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Service\{ManagementAccessContext, TeamIntegrationService, UnitFolderService, UnitMoveDataService, UnitMoveGuard, UnitMoveService};
use OCA\Domus\Tests\Support\{MoveFilesystem, TransferDatabase};
use OCP\Files\IRootFolder;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class UnitMoveTest extends TestCase {
    private TransferDatabase $db;
    private MoveFilesystem $fs;
    private UnitMoveService $service;
    private TeamIntegrationService $teams;
    private ManagementAccessContext $access;
    private IRootFolder $root;
    private IL10N $l10n;
    private int $receipt;
    private int $image;
    private array $auditEvents = [];

    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $this->fs = new MoveFilesystem();
        $home = $this->fs->folder('/alice/files');
        $this->fs->folder('/alice/files/Unit');
        $this->fs->folder('/alice/files/Unit/2025');
        $this->fs->folder('/alice/files/Unit/empty');
        $this->fs->folder('/alice/files/Team');
        $this->receipt = $this->fs->file('/alice/files/Unit/2025/receipt.pdf', 'receipt')->getId();
        $this->fs->file('/alice/files/Unit/unlinked.txt', 'unlinked');
        $this->image = $this->fs->file('/alice/files/cover.jpg', 'image')->getId();
        $this->root = $this->createMock(IRootFolder::class);
        $this->root->method('getUserFolder')->willReturnCallback(fn($uid) => $this->fs->nodes['/' . $uid . '/files']);
        $this->l10n = $this->createMock(IL10N::class);
        $this->l10n->method('t')->willReturnArgument(0);
        $this->access = $this->createMock(ManagementAccessContext::class);
        $this->access->method('legacyOwnerUserId')->willReturn('alice');
        $this->teams = $this->createMock(TeamIntegrationService::class);
        $this->teams->method('getTeamFolder')->willReturn(['mountPoint' => 'Team', 'id' => 20]);
        $audit = $this->createMock(\OCA\Domus\Service\AuditService::class);
        $audit->method('record')->willReturnCallback(function ($event) { $this->auditEvents[] = $event; });
        $this->service = new UnitMoveService(new UnitMoveDataService($this->db, $this->l10n), $this->access, $this->teams,
            new UnitFolderService($this->root, $this->l10n), $this->createMock(UnitMoveGuard::class), $this->root, $this->db, $this->l10n, $audit);
        $owner = ['user_id' => 'alice', 'team_id' => null];
        $this->db->tables = [
            'domus_units' => [['id' => 10, 'label' => 'Apartment', 'property_id' => null, 'image_file_id' => $this->image, 'document_path' => 'Unit'] + $owner,
                ['id' => 11, 'label' => 'Unrelated', 'property_id' => null, 'image_file_id' => null, 'document_path' => 'Other'] + $owner],
            'domus_tenancies' => [['id' => 20, 'unit_id' => 10] + $owner],
            'domus_bookings' => [['id' => 30, 'unit_id' => 10, 'account' => 2000] + $owner],
            'domus_booking_years' => [['id' => 40, 'unit_id' => 10, 'year' => 2025, 'closed_at' => 123, 'team_id' => null]],
            'domus_partner_rel' => [['id' => 50, 'type' => 'tenancy', 'relation_id' => 20, 'partner_id' => 60] + $owner],
            'domus_partners' => [['id' => 60, 'name' => 'Renter', 'nc_user_id' => 'renter'] + $owner],
            'domus_docLinks' => [['id' => 70, 'entity_type' => 'unit', 'entity_id' => 10, 'file_id' => $this->receipt] + $owner,
                ['id' => 71, 'entity_type' => 'tenancy', 'entity_id' => 20, 'file_id' => $this->receipt] + $owner],
            'domus_tasks' => [['id' => 80, 'entity_type' => 'unit', 'entity_id' => 10, 'rule_id' => 90, 'team_id' => null]],
            'domus_rule_sets' => [['id' => 90, 'definition' => json_encode(['scope' => 'allUnits', 'scopeIds' => [], 'enabled' => true])] + $owner],
            'domus_rule_tasks' => [['id' => 91, 'task_id' => 80, 'ruleset_id' => 90, 'occurrence_key' => 'cycle']],
            'domus_accounts' => [['id' => 1, 'scope_key' => 'global', 'number' => 2000, 'is_system' => 1, 'team_id' => null]],
            'domus_workflow_runs' => [['id' => 100, 'entity_type' => 'unit', 'entity_id' => 10, 'template_id' => 120, 'team_id' => null]],
            'domus_task_templates' => [['id' => 120, 'key' => 'test', 'name' => 'Test', 'scope_key' => 'global', 'team_id' => null]],
            'domus_task_tpl_steps' => [['id' => 121, 'template_id' => 120, 'title' => 'Step', 'team_id' => null]],
            'domus_task_steps' => [['id' => 130, 'entity_type' => 'unit', 'entity_id' => 10, 'workflow_run_id' => 100, 'team_id' => null]],
        ];
    }

    public function testAuditStartAndCompletionAreNotRepeatedOnRetries(): void {
        $this->start();
        $this->service->start(10, 'team-a', 'lost-response');
        $this->finish();
        $this->service->advance(10);
        self::assertSame(['unit_move.started', 'unit_move.completed'], $this->auditEvents);
    }

    public function testAuditCancellationIsNotRepeated(): void {
        $this->start();
        $this->service->cancel(10);
        $this->service->cancel(10);
        self::assertSame(['unit_move.started', 'unit_move.cancelled'], $this->auditEvents);
    }

    public function testAuditFailedCutoverNeverReportsCompletion(): void {
        $this->start();
        $this->db->tables['domus_units'][0]['label'] = 'Changed';
        try { $this->finish(); self::fail('Expected conflict'); }
        catch (ConflictException $e) {}
        self::assertSame(['unit_move.started', 'unit_move.failed'], $this->auditEvents);
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
    }

    private function start(): array {
        $preview = $this->service->preview(10, 'team-a');
        return $this->service->start(10, 'team-a', $preview['token']);
    }
    private function finish(): array {
        for ($i = 0; $i < 10; $i++) {
            $result = $this->service->advance(10);
            if ($result['status'] === 'complete') return $result;
        }
        $this->fail('Move did not finish');
    }

    public function testPreviewIncludesProcessesWhenThereAreNoStandaloneTasks(): void {
        $this->db->tables['domus_tasks'] = [];
        $preview = $this->service->preview(10, 'team-a');
        self::assertSame(0, $preview['tasks']);
        self::assertSame(1, $preview['workflowRuns']);
        self::assertSame(1, $preview['taskSteps']);
        $this->start();
        $this->finish();
        self::assertSame('team-a', $this->db->tables['domus_workflow_runs'][0]['team_id']);
        self::assertSame('team-a', $this->db->tables['domus_task_steps'][0]['team_id']);
    }

    public function testDestinationPreservesSourceFolderNameAndAvoidsExistingFolders(): void {
        self::assertSame('Team/Unit', $this->service->preview(10, 'team-a')['destination']);
        $this->fs->folder('/alice/files/Team/Unit');
        $this->fs->file('/alice/files/Team/Unit/existing.txt', 'untouched');
        self::assertSame('Team/Unit (2)', $this->service->preview(10, 'team-a')['destination']);
        $this->start();
        $result = $this->finish();
        self::assertSame('Team/Unit (2)', $result['destination']);
        self::assertSame('untouched', $this->fs->nodes['/alice/files/Team/Unit/existing.txt']->content);
    }

    public function testFolderAppearingAfterPreviewRequiresAnotherReview(): void {
        $preview = $this->service->preview(10, 'team-a');
        $this->fs->folder('/alice/files/Team/Unit');
        $this->expectException(ConflictException::class);
        $this->service->start(10, 'team-a', $preview['token']);
    }

    public function testPreviewCountsActivitiesIncludedInTheMove(): void {
        $owner = ['user_id' => 'alice', 'team_id' => null];
        $this->db->tables['domus_action_logs'] = [
            ['id' => 150, 'entity_type' => 'unit', 'entity_id' => 10, 'title' => 'Unit activity'] + $owner,
            ['id' => 151, 'entity_type' => 'tenancy', 'entity_id' => 20, 'title' => 'Tenancy activity'] + $owner,
            ['id' => 152, 'entity_type' => 'unit', 'entity_id' => 11, 'title' => 'Unrelated activity'] + $owner,
        ];
        self::assertSame(2, $this->service->preview(10, 'team-a')['activities']);
        $this->start();
        $this->finish();
        self::assertSame('team-a', $this->db->tables['domus_action_logs'][0]['team_id']);
        self::assertSame('team-a', $this->db->tables['domus_action_logs'][1]['team_id']);
        self::assertNull($this->db->tables['domus_action_logs'][2]['team_id']);
    }

    public function testFullTreeAndReferencesMoveWhileOriginalFilesRemain(): void {
        $start = $this->start();
        $result = $this->finish();
        $unit = $this->db->tables['domus_units'][0];
        self::assertSame('team-a', $unit['team_id']);
        self::assertSame(10, $unit['id']);
        self::assertSame($result['destination'], $unit['document_path']);
        $target = '/alice/files/' . $unit['document_path'];
        self::assertArrayHasKey($target . '/empty', $this->fs->nodes);
        self::assertSame('unlinked', $this->fs->nodes[$target . '/unlinked.txt']->content);
        self::assertSame('receipt', $this->fs->nodes['/alice/files/Unit/2025/receipt.pdf']->content);
        self::assertSame('image', $this->fs->nodes['/alice/files/cover.jpg']->content);
        $links = $this->db->tables['domus_docLinks'];
        self::assertNotSame($this->receipt, $links[0]['file_id']);
        self::assertSame($links[0]['file_id'], $links[1]['file_id']);
        self::assertSame('team-a', $links[1]['team_id']);
        self::assertNotSame($this->image, $unit['image_file_id']);
        self::assertNull($this->db->tables['domus_units'][1]['team_id']);
        self::assertSame(123, $this->db->tables['domus_booking_years'][0]['closed_at']);
        self::assertSame('team-a', $this->db->tables['domus_booking_years'][0]['team_id']);
        self::assertCount(1, $this->db->tables['domus_partners']);
        self::assertSame('renter', $this->db->tables['domus_partners'][0]['nc_user_id']);
        self::assertSame('team-a', $this->db->tables['domus_partners'][0]['team_id']);
        self::assertSame(60, $this->db->tables['domus_partner_rel'][0]['partner_id']);
        self::assertNotSame(120, $this->db->tables['domus_workflow_runs'][0]['template_id']);
        self::assertSame('team-a', $this->db->tables['domus_task_steps'][0]['team_id']);
        self::assertSame($this->db->tables['domus_tasks'][0]['rule_id'], $this->db->tables['domus_rule_tasks'][0]['ruleset_id']);
        self::assertSame([10], json_decode($this->db->tables['domus_rule_sets'][1]['definition'], true)['scopeIds']);
        self::assertSame('complete', $this->service->advance(10)['status']);
        self::assertSame('complete', $this->service->start(10, 'team-a', 'lost-response')['status']);
        self::assertSame(1, $this->db->commits);
    }

    public function testFailedCopyCanResumeWithoutDuplicatingCompletedFiles(): void {
        $this->start();
        $this->fs->failFile = 'unlinked.txt';
        try { $this->service->advance(10); self::fail('Expected storage failure'); }
        catch (\RuntimeException $e) { self::assertSame('Storage unavailable', $e->getMessage()); }
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
        $copiedId = $this->fs->nodes['/alice/files/' . $this->service->status(10)['destination'] . '/2025/receipt.pdf']->getId();
        $this->fs->failFile = null;
        $this->finish();
        self::assertSame($copiedId, $this->db->tables['domus_docLinks'][0]['file_id']);
    }

    public function testChangedSourcePreventsCutoverAndCancellationRetainsFiles(): void {
        $this->start();
        $this->fs->nodes['/alice/files/Unit/2025/receipt.pdf']->content = 'changed';
        try { $this->finish(); self::fail('Expected conflict'); }
        catch (ConflictException $e) { self::assertStringContainsString('changed', $e->getMessage()); }
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
        self::assertSame('cancelled', $this->service->cancel(10)['status']);
        self::assertSame('changed', $this->fs->nodes['/alice/files/Unit/2025/receipt.pdf']->content);
    }

    public function testChangedDatabaseRollsBackBeforeCutover(): void {
        $this->start();
        $this->db->tables['domus_bookings'][0]['amount'] = '999';
        try { $this->finish(); self::fail('Expected conflict'); }
        catch (ConflictException $e) { self::assertSame(1, $this->db->rollbacks); }
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
    }

    public function testForeignUnitAndTeamAreRejected(): void {
        $this->db->tables['domus_units'][0]['user_id'] = 'someone-else';
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $this->service->preview(10, 'team-a');
    }

    public function testTeamRevocationPreventsCompletion(): void {
        $this->start();
        $this->teams->method('assertTeamAdmin')->willThrowException(new \DomainException('Revoked'));
        $this->expectException(\DomainException::class);
        $this->service->advance(10);
    }

    public function testSecondMemberResolvesFolderIdUnderTheirMountPath(): void {
        $this->start();
        $this->finish();
        $stored = $this->db->tables['domus_units'][0];
        $this->fs->folder('/bob/files');
        $this->fs->folder('/bob/files/Renamed Team/Apartment', $stored['document_folder_id']);
        $unit = new Unit();
        $unit->setDocumentFolderId($stored['document_folder_id']);
        $unit->setDocumentPath($stored['document_path']);
        (new UnitFolderService($this->root, $this->l10n))->refreshPath($unit, 'bob');
        self::assertSame('Renamed Team/Apartment', $unit->getDocumentPath());
    }

    public function testConflictingCustomAccountRollsBackOwnership(): void {
        $this->db->tables['domus_accounts'][0] = ['id' => 1, 'scope_key' => 'user:alice', 'number' => 2000, 'is_system' => 0, 'team_id' => null, 'parent_id' => null, 'label_de' => 'Kosten', 'label_en' => 'Costs'];
        $this->db->tables['domus_accounts'][] = ['id' => 2, 'scope_key' => 'team:team-a', 'number' => 2000, 'is_system' => 0, 'team_id' => 'team-a', 'parent_id' => null, 'label_de' => 'Anders', 'label_en' => 'Different'];
        $this->start();
        try { $this->finish(); self::fail('Expected account conflict'); }
        catch (ConflictException $e) { self::assertStringContainsString('account', $e->getMessage()); }
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
        self::assertCount(1, $this->db->tables['domus_partners']);
    }
    public function testCancellationReleasesPendingWriteGuardForTheActor(): void {
        $this->start();
        $guard = new UnitMoveGuard($this->createMock(\OCP\Lock\ILockingProvider::class), $this->db, $this->l10n);
        $guard->assertWritable('bob');
        try { $guard->assertWritable('alice'); self::fail('Expected pending move to block writes'); }
        catch (ConflictException $e) { self::assertStringContainsString('paused', $e->getMessage()); }
        $this->service->cancel(10);
        $guard->assertWritable('alice');
        self::assertNull($this->db->tables['domus_units'][0]['team_id']);
    }

    public function testStalePreviewCannotStartAfterSourceChanges(): void {
        $preview = $this->service->preview(10, 'team-a');
        $this->fs->file('/alice/files/Unit/new.txt', 'added after preview');
        $this->expectException(ConflictException::class);
        $this->service->start(10, 'team-a', $preview['token']);
    }

    public function testMissingLinkedFileCannotBeSilentlySkipped(): void {
        $this->db->tables['domus_docLinks'][0]['file_id'] = 99999;
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $this->service->preview(10, 'team-a');
    }

    public function testMissingSourceTreeIsDisclosedAndLinkedFilesStillMove(): void {
        $this->db->tables['domus_units'][0]['document_path'] = 'Missing';
        $preview = $this->service->preview(10, 'team-a');
        self::assertTrue($preview['sourceFolderMissing']);
        self::assertSame(2, $preview['files']);
        $this->start();
        $this->finish();
        self::assertSame('Team/Missing', $this->db->tables['domus_units'][0]['document_path']);
        self::assertNotSame($this->receipt, $this->db->tables['domus_docLinks'][0]['file_id']);
    }

    public function testReadonlyDestinationIsRejectedBeforeStarting(): void {
        $this->fs->nodes['/alice/files/Team']->writable = false;
        $this->expectException(ConflictException::class);
        $this->service->preview(10, 'team-a');
    }

    public function testDestinationEditAfterVerificationPreventsCutover(): void {
        for ($i = 0; $i < 20; $i++) $this->fs->file('/alice/files/Unit/file-' . $i, 'content');
        $this->start();
        do { $status = $this->service->advance(10); } while ($status['verified'] < 10);
        $target = '/alice/files/' . $status['destination'] . '/2025/receipt.pdf';
        $this->fs->nodes[$target]->content = 'modified by another Team member';
        try { $this->finish(); self::fail('Expected destination conflict'); }
        catch (ConflictException $e) { self::assertNull($this->db->tables['domus_units'][0]['team_id']); }
    }

    public function testPreviewControllerReturnsTheSpecificConflictReason(): void {
        $moves = $this->createMock(UnitMoveService::class);
        $moves->method('preview')->willThrowException(new ConflictException('Source and destination folders must be separate.'));
        $controller = new \OCA\Domus\Controller\UnitMoveController(
            $this->createMock(\OCP\IRequest::class), $moves, $this->l10n, $this->createMock(\Psr\Log\LoggerInterface::class),
        );
        $response = $controller->preview(10, 'team-a');
        self::assertSame(409, $response->getStatus());
        self::assertSame('Source and destination folders must be separate.', $response->getData()['message']);
    }

}
