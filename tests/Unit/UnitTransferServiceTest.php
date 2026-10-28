<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Account;
use OCA\Domus\Db\ActionLog;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\Partner;
use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\UnitTransferService;
use PHPUnit\Framework\TestCase;

class UnitTransferServiceTest extends TestCase {
    private array $dependencies;
    private array $entries;

    /** @dataProvider archiveVersions */
    public function testEarlyCompletionAtFirstStepRoundTripsAndReopens(bool $legacy): void {
        $transfer = $this->service();
        $d = $this->dependencies;
        $unit = new Unit(); $unit->setId(5); $unit->setLabel('Unit');
        $d['unitMapper']->method('findForUser')->willReturn($unit);
        $run = new \OCA\Domus\Db\WorkflowRun();
        $run->setId(10); $run->setTemplateId(21); $run->setEntityType('unit'); $run->setEntityId(5); $run->setStatus('open');
        $steps = [];
        foreach (['open', 'new'] as $index => $status) {
            $step = new \OCA\Domus\Db\TaskStep();
            $step->setId($index + 1); $step->setWorkflowRunId(10); $step->setEntityType('unit'); $step->setEntityId(5);
            $step->setSortOrder($index + 1); $step->setStatus($status); $step->setAllowEarlyCompletion(1); $step->setDefaultDueDaysOffset(0);
            $steps[] = $step;
        }
        $d['workflowRunMapper']->method('findById')->willReturnCallback(function () use (&$run) { return $run; });
        $d['workflowRunMapper']->method('findByEntity')->willReturnCallback(function () use (&$run) { return [$run]; });
        $d['taskStepMapper']->method('findById')->willReturnCallback(function () use (&$steps) { return $steps[0]; });
        $d['taskStepMapper']->method('findByRun')->willReturnCallback(function () use (&$steps) { return $steps; });
        $workflow = new \OCA\Domus\Service\WorkflowRunService($d['workflowRunMapper'], $d['taskStepMapper'], $d['taskTemplateMapper'], $d['taskTemplateStepMapper'], $d['propertyMapper'], $d['unitMapper'], $this->createMock(\OCA\Domus\Service\EntityImageService::class), $d['connection'], $d['l10n']);
        $workflow->closeEarly(1, 'source');
        self::assertSame('early', $run->getCompletionType());
        self::assertSame(['skipped', 'skipped'], array_map(fn($step) => $step->getStatus(), $steps));
        $template = new \OCA\Domus\Db\TaskTemplate(); $template->setId(21); $template->setKey('custom');
        $d['taskTemplateMapper']->method('findForRun')->willReturn($template);
        $d['taskTemplateMapper']->method('insert')->willReturnCallback(function ($row) { $row->setId(121); return $row; });
        $payload = $transfer->exportUnitDataset(5, 'source');
        if ($legacy) unset($payload['workflowRuns'][0]['completionType']);
        $d['workflowRunMapper']->method('insert')->willReturnCallback(function ($row) use (&$run) { $row->setId(119); $run = $row; return $row; });
        $steps = [];
        $d['taskStepMapper']->method('insert')->willReturnCallback(function ($row) use (&$steps) { $row->setId(count($steps) + 101); $steps[] = $row; return $row; });
        $transfer->importUnitDataset($payload, 'target', 'landlord');
        self::assertSame('early', $run->getCompletionType());
        $workflow->reopenStep(101, 'target');
        self::assertSame('open', $run->getStatus());
        self::assertNull($run->getCompletionType());
        self::assertSame(['open', 'new'], array_map(fn($step) => $step->getStatus(), $steps));
    }

    public static function archiveVersions(): array { return [[false], [true]]; }

    public function testImportRejectsInvalidCompletionTypeAndRollsBack(): void {
        $service = $this->service();
        $template = new \OCA\Domus\Db\TaskTemplate(); $template->setId(21);
        $this->dependencies['taskTemplateMapper']->method('findByKey')->willReturn($template);
        $this->dependencies['connection']->expects(self::once())->method('rollBack');
        $this->dependencies['connection']->expects(self::never())->method('commit');
        $this->expectException(\InvalidArgumentException::class);
        $service->importUnitDataset(['unit' => ['label' => 'Unit'], 'workflowRuns' => [['templateKey' => 'custom', 'completionType' => 'invalid']]], 'target', 'landlord');
    }

    public function testImportAuditRunsOnlyAfterCommit(): void {
        $service = $this->service();
        $committed = false;
        $this->dependencies['connection']->method('commit')->willReturnCallback(function () use (&$committed) { $committed = true; });
        $this->dependencies['audit']->expects(self::once())->method('record')->with('unit.imported', self::anything(), 'target', null)
            ->willReturnCallback(function () use (&$committed) { self::assertTrue($committed); });
        $service->importUnitDataset(['unit' => ['label' => 'Unit']], 'target', 'landlord');
    }

    public function testFailedImportDoesNotAuditSuccess(): void {
        $service = $this->service();
        $this->dependencies['connection']->method('commit')->willThrowException(new \RuntimeException('Failed commit'));
        $this->dependencies['connection']->expects(self::once())->method('rollBack');
        $this->dependencies['audit']->expects(self::never())->method('record');
        $this->expectException(\RuntimeException::class);
        $service->importUnitDataset(['unit' => ['label' => 'Unit']], 'target', 'landlord');
    }

    public function testSelectedTeamCannotUsePersonalUnitTransfer(): void {
        $service = $this->service(mapped: true);
        $this->expectException(\DomainException::class);
        $service->exportUnitDataset(5, 'source');
    }

    public function testPersonalImportRejectsTeamMarkersBeforeStartingTransaction(): void {
        foreach ([
            ['unit' => ['label' => 'Unit', 'teamId' => 'a']],
            ['unit' => ['label' => 'Unit'], 'partners' => [['team_id' => 'b']]],
            ['unit' => ['label' => 'Unit'], 'workflowRuns' => [['steps' => [['teamId' => 'b']]]]],
            ['unit' => ['label' => 'Unit'], 'taskTemplates' => [['scopeKey' => 'team:b']]],
        ] as $payload) {
            $service = $this->service();
            $this->dependencies['connection']->expects($this->never())->method('beginTransaction');
            try {
                $service->importUnitDataset($payload, 'target', 'landlord');
                $this->fail('Foreign Team records must not be imported.');
            } catch (\InvalidArgumentException $e) {
                $this->assertStringContainsString('Team', $e->getMessage());
            }
        }
    }

    public function testPartnerImportDoesNotRestoreAccountAccess(): void {
        $service = $this->service();
        $this->dependencies['partnerMapper']->expects($this->once())->method('insert')
            ->with($this->callback(fn ($partner) => $partner->getNcUserId() === null));
        $service->importUnitDataset(['unit' => ['label' => 'Unit'],
            'partners' => [['id' => 1, 'name' => 'Tenant', 'ncUserId' => 'renter']]], 'target', 'landlord');
    }

    public function testRoundTripPreservesActivityAndRemapsAllIncludedObjects(): void {
        $service = $this->service();
        $unit = new Unit();
        $unit->setId(5);
        $unit->setLabel('Unit');
        $this->dependencies['unitMapper']->method('findForUser')->willReturn($unit);
        $partner = new Partner();
        $partner->setId(7);
        $partner->setName('Partner');
        $partner->setPartnerType('tenant');
        $this->dependencies['partnerMapper']->method('findForUserByIds')->willReturn([$partner]);
        $tenancy = new Tenancy();
        $tenancy->setId(9);
        $tenancy->setStartDate('2026-01-01');
        $this->dependencies['tenancyMapper']->method('findByUser')->willReturn([$tenancy]);
        $booking = new Booking();
        $booking->setId(11);
        $booking->setAccount(0);
        $booking->setDate('2026-01-01');
        $booking->setAmount('-12.34');
        $this->dependencies['bookingMapper']->expects($this->once())->method('insert')->with($this->callback(fn($imported) => $imported->getAmount() === '-12.34'));
        $this->dependencies['bookingMapper']->method('findByUser')->willReturn([$booking]);
        $logs = [];
        foreach (['unit' => 5, 'partner' => 7, 'tenancy' => 9, 'booking' => 11] as $type => $id) {
            $entry = $this->entry($type, $id);
            $logs[] = $entry;
        }
        $this->dependencies['actionLogMapper']->expects($this->once())->method('findByEntity')->with('source', 'unit', 5)->willReturn($logs);
        $payload = $service->exportUnitDataset(5, 'source');
        $this->assertCount(4, $payload['actionLogs']);
        $result = $service->importUnitDataset($payload, 'target', 'landlord');
        $this->assertSame(105, $result['unitId']);
        $this->assertSame([], $result['warnings']);
        $expected = ['unit' => 105, 'partner' => 107, 'tenancy' => 109, 'booking' => 111];
        foreach ($this->entries as $entry) {
            $this->assertSame('target', $entry->getUserId());
            $this->assertSame('target', $entry->getCreatedBy());
            $this->assertSame('unit', $entry->getEntityType());
            $this->assertSame(105, $entry->getEntityId());
            $this->assertSame($expected[$entry->getLinkedEntityType()], $entry->getLinkedEntityId());
            $this->assertSame('History', $entry->getData());
            $this->assertSame(123, $entry->getCreatedAt());
            $this->assertSame(124, $entry->getUpdatedAt());
            $this->assertSame('system', $entry->getSource());
        }
    }

    public function testMissingLinksPreserveHistoryAndLabelsAndProduceOneWarning(): void {
        $service = $this->service();
        $logs = [$this->entry('document', 13)->jsonSerialize(), $this->entry('property', 15)->jsonSerialize(), $this->entry('unit', 99)->jsonSerialize()];
        $result = $service->importUnitDataset(['unit' => ['id' => 5, 'label' => 'Unit'], 'actionLogs' => $logs], 'target', 'landlord');
        $this->assertCount(3, $this->entries);
        $this->assertCount(1, $result['warnings']);
        foreach ($this->entries as $entry) {
            $this->assertNull($entry->getLinkedEntityType());
            $this->assertNull($entry->getLinkedEntityId());
            $this->assertSame('Original label', $entry->getLinkedLabel());
            $this->assertSame('History', $entry->getData());
        }
    }

    public function testLegacyPayloadWithoutActivityStillImports(): void {
        $service = $this->service();
        $result = $service->importUnitDataset(['unit' => ['id' => 5, 'label' => 'Unit']], 'target', 'landlord');
        $this->assertSame(105, $result['unitId']);
        $this->assertSame([], $result['warnings']);
        $this->assertSame([], $this->entries);
    }

    public function testActivityInsertFailureRollsBackWholeImport(): void {
        $service = $this->service(false);
        $this->dependencies['connection']->expects($this->once())->method('rollBack');
        $this->dependencies['connection']->expects($this->never())->method('commit');
        $this->dependencies['actionLogMapper']->method('insert')->willThrowException(new \RuntimeException('Insert failed'));
        $this->expectExceptionMessage('Insert failed');
        $service->importUnitDataset(['unit' => ['id' => 5, 'label' => 'Unit'], 'actionLogs' => [$this->entry(null, null)->jsonSerialize()]], 'target', 'landlord');
    }

    public function testProcessImportPreservesCompletionPermissionsAndUsers(): void {
        $service = $this->service();
        $this->dependencies['taskTemplateMapper']->method('insert')->willReturnCallback(function ($template) { $template->setId(121); return $template; });
        $this->dependencies['taskTemplateStepMapper']->expects($this->once())->method('insert')->with($this->callback(fn($step) => $step->getAllowEarlyCompletion() === 1 && $step->getTemplateId() === 121))->willReturnArgument(0);
        $this->dependencies['workflowRunMapper']->method('insert')->willReturnCallback(function ($run) {
            $this->assertSame('target', $run->getClosedBy());
            $this->assertSame(121, $run->getTemplateId());
            $run->setId(119);
            return $run;
        });
        $this->dependencies['taskStepMapper']->expects($this->once())->method('insert')->with($this->callback(fn($step) => $step->getAllowEarlyCompletion() === 1 && $step->getWorkflowRunId() === 119))->willReturnArgument(0);
        $service->importUnitDataset([
            'unit' => ['id' => 5, 'label' => 'Unit'],
            'taskTemplates' => [['id' => 21, 'key' => 'custom', 'steps' => [['title' => 'Step', 'allowEarlyCompletion' => true]]]],
            'workflowRuns' => [['templateId' => 21, 'closedBy' => 'source', 'steps' => [['title' => 'Step', 'allowEarlyCompletion' => true]]]],
        ], 'target', 'landlord');
    }

    public function testImportRejectsMalformedAmountAndRollsBack(): void {
        $service = $this->service();
        $this->dependencies['bookingMapper']->expects($this->never())->method('insert');
        $this->dependencies['connection']->expects($this->once())->method('rollBack');
        $this->expectException(\InvalidArgumentException::class);
        $service->importUnitDataset([
            'unit' => ['label' => 'Unit'],
            'bookings' => [['date' => '2026-01-01', 'account' => 0, 'amount' => 'abc']],
        ], 'target', 'landlord');
    }

    private function entry(?string $type, ?int $id): ActionLog {
        $entry = new ActionLog();
        $entry->setUserId('source');
        $entry->setCreatedBy('source');
        $entry->setEntityType('unit');
        $entry->setEntityId(5);
        $entry->setType('note');
        $entry->setTitle('Event');
        $entry->setData('History');
        $entry->setSource('system');
        $entry->setLinkedEntityType($type);
        $entry->setLinkedEntityId($id);
        $entry->setLinkedLabel('Original label');
        $entry->setCreatedAt(123);
        $entry->setUpdatedAt(124);
        return $entry;
    }

    private function service(bool $captureEntries = true, bool $mapped = false): UnitTransferService {
        $this->dependencies = [];
        $this->entries = [];
        foreach ((new \ReflectionClass(UnitTransferService::class))->getConstructor()->getParameters() as $parameter) {
            $this->dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        foreach (['unitMapper' => 105, 'partnerMapper' => 107, 'tenancyMapper' => 109, 'bookingMapper' => 111] as $name => $id) {
            $this->dependencies[$name]->method('insert')->willReturnCallback(function ($entity) use ($id) { $entity->setId($id); return $entity; });
        }
        $this->dependencies['l10n']->method('t')->willReturnCallback(fn($message) => $message);
        $this->dependencies['managementContext']->method('activeTeamId')->willReturn($mapped ? 'team-a' : null);
        $this->dependencies['accountMapper']->method('findByNumber')->willReturn(new Account());
        if ($captureEntries) {
            $this->dependencies['actionLogMapper']->method('insert')->willReturnCallback(function ($entry) { $this->entries[] = $entry; return $entry; });
        }
        return new UnitTransferService(...array_values($this->dependencies));
    }
}
