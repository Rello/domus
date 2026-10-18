<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{RuleMapper, Unit, UnitMapper, PropertyMapper, Tenancy, TenancyMapper, Task};
use OCA\Domus\Service\{RuleService, RentReviewEvaluator, TaskService};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class RuleServiceTest extends TestCase {
    private array $rule;
    private array $references = [];
    private array $stored;
    private Tenancy $tenancy;
    private RuleService $service;
    private TaskService $tasks;
    private UnitMapper $units;

    protected function setUp(): void {
        $this->rule = ['id' => 1, 'name' => 'Review', 'enabled' => true, 'months' => 36, 'scope' => 'allUnits', 'scopeIds' => [], 'autoTask' => true, 'dueDays' => 30];
        $this->stored = [];
        $mapper = $this->createMock(RuleMapper::class);
        $mapper->method('references')->willReturnCallback(fn() => $this->references);
        $mapper->method('saveReference')->willReturnCallback(function ($id, $date) { $this->references[$id] = $date; });
        $mapper->method('listRules')->willReturnCallback(fn() => [$this->rule]);
        $mapper->method('locked')->willReturnCallback(fn($id, $action) => $action($this->rule));
        $mapper->method('taskLinks')->willReturnCallback(fn() => $this->stored);
        $mapper->method('linkTask')->willReturnCallback(function ($id, $cycle, $taskId) {
            return $this->stored[$cycle] = ['id' => count($this->stored) + 1, 'taskId' => $taskId];
        });
        $unit = new Unit(); $unit->setId(7); $unit->setPropertyId(3); $unit->setLabel('Apartment');
        $this->units = $this->createMock(UnitMapper::class);
        $this->units->method('findByUser')->willReturn([$unit]);
        $this->units->method('findForUser')->willReturnCallback(fn($id) => $id === 7 ? $unit : null);
        $this->tenancy = new Tenancy();
        $this->tenancy->setId(10); $this->tenancy->setUnitId(7); $this->tenancy->setStartDate('2010-01-01');
        $this->tenancy->setBaseRent('900');
        $tenancies = $this->createMock(TenancyMapper::class);
        $tenancies->method('findByUser')->willReturnCallback(fn() => [$this->tenancy]);
        $this->tasks = $this->createMock(TaskService::class);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $this->service = new RuleService($mapper, $this->units, $this->createMock(PropertyMapper::class), $tenancies, new RentReviewEvaluator(), $this->tasks, $l10n, $this->createMock(\OCA\Domus\Db\PartnerRelMapper::class));
    }

    public function testAlertWarningUsesCurrentRulesetTemplateAndThreshold(): void {
        $this->rule['autoTask'] = false;
        $this->rule['alertWarning'] = 'Please review after {months} months.';
        self::assertSame('Please review after {months} months.', $this->service->validate($this->rule, 'alice')['alertWarning']);
        self::assertSame('Please review after 36 months.', $this->service->preview($this->rule, 'alice')[0]['alertWarning']);
        $this->service->evaluate('alice');
        $this->rule['alertWarning'] = 'Check the rent: {months} months.';
        self::assertSame('Check the rent: 36 months.', $this->service->evaluate('alice')['alerts'][0]['alertWarning']);
    }

    public function testEmptyAlertWarningIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->service->validate($this->rule + ['alertWarning' => ' '], 'alice');
    }

    public function testAutoTaskCreatedOnceAcrossRepeatedRunsAndConditionPeriods(): void {
        $task = new Task(); $task->setId(88);
        $this->tasks->expects(self::once())->method('createTask')->with('unit', 7, 'Review rent', self::anything(), self::anything(), 'alice')->willReturn($task);
        $first = $this->service->evaluate('alice');
        $second = $this->service->evaluate('alice');
        self::assertSame(1, $first['createdTasks']);
        self::assertSame(0, $second['createdTasks']);
        self::assertSame(88, $second['alerts'][0]['taskId']);
        self::assertSame(['id' => 1, 'taskId' => 88], array_values($this->stored)[0]);
        // No dependence on task status or existence: closed/deleted tasks must not regenerate.
        $this->service->evaluate('alice');
    }

    public function testUnknownEffectiveDateCreatesHistoryTaskButPreviewDoesNotPersist(): void {
        $this->references[10] = '';
        $this->tasks->expects(self::once())->method('createTask')->with('unit', 7, 'Check rent history', self::anything(), self::anything(), 'alice');
        $preview = $this->service->preview($this->rule, 'alice');
        self::assertSame('unknown', $preview[0]['status']);
        self::assertSame([], $this->stored);
        self::assertSame('unknown', $this->service->evaluate('alice')['alerts'][0]['status']);
    }

    public function testDisabledRuleResolvesAlertsButKeepsTaskLink(): void {
        $task = new Task(); $task->setId(99);
        $this->tasks->expects(self::once())->method('createTask')->willReturn($task);
        $this->service->evaluate('alice');
        $this->rule['enabled'] = false;
        self::assertSame([], $this->service->evaluate('alice')['alerts']);
        self::assertCount(1, $this->stored);
        self::assertArrayNotHasKey('resolved', array_values($this->stored)[0]);
        $this->rule['enabled'] = true;
        self::assertSame(99, $this->service->evaluate('alice')['alerts'][0]['taskId']);
    }

    public function testIncreaseAndEndedTenancyResolveOldAlerts(): void {
        $this->rule['autoTask'] = false;
        $this->service->evaluate('alice');
        $this->references[10] = date('Y-m-d');
        self::assertSame([], $this->service->evaluate('alice')['alerts']);
        self::assertCount(1, $this->stored);
        self::assertArrayNotHasKey('resolved', array_values($this->stored)[0]);
        $this->references[10] = '2010-01-01';
        $this->tenancy->setEndDate('2020-01-01');
        self::assertSame([], $this->service->evaluate('alice')['alerts']);
    }

    public function testPropertyAndUnitScopesExcludeOtherUnits(): void {
        $this->rule['autoTask'] = false;
        foreach ([['units', [8], 0], ['properties', [4], 0], ['properties', [3], 1], ['units', [7], 1]] as [$scope, $ids, $count]) {
            $this->rule['scope'] = $scope; $this->rule['scopeIds'] = $ids;
            self::assertCount($count, $this->service->evaluate('alice')['alerts']);
        }
    }

    public function testForeignUnitScopeIsRejected(): void {
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $this->service->validate(array_merge($this->rule, ['scope' => 'units', 'scopeIds' => [8]]), 'alice');
    }

    public function testInvalidThresholdIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->service->validate(array_merge($this->rule, ['months' => 0]), 'alice');
    }

}
