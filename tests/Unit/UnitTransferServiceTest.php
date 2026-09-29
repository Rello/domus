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

    private function service(bool $captureEntries = true): UnitTransferService {
        $this->dependencies = [];
        $this->entries = [];
        foreach ((new \ReflectionClass(UnitTransferService::class))->getConstructor()->getParameters() as $parameter) {
            $this->dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        foreach (['unitMapper' => 105, 'partnerMapper' => 107, 'tenancyMapper' => 109, 'bookingMapper' => 111] as $name => $id) {
            $this->dependencies[$name]->method('insert')->willReturnCallback(function ($entity) use ($id) { $entity->setId($id); return $entity; });
        }
        $this->dependencies['l10n']->method('t')->willReturnCallback(fn($message) => $message);
        $this->dependencies['accountMapper']->method('findByNumber')->willReturn(new Account());
        if ($captureEntries) {
            $this->dependencies['actionLogMapper']->method('insert')->willReturnCallback(function ($entry) { $this->entries[] = $entry; return $entry; });
        }
        return new UnitTransferService(...array_values($this->dependencies));
    }
}
