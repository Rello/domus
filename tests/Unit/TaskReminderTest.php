<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Task, TaskMapper, RuleMapper, Unit, UnitMapper, PropertyMapper, Tenancy, TenancyMapper, PartnerRelMapper};
use OCA\Domus\Service\{TaskService, RuleService, RentReviewEvaluator};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class TaskReminderTest extends TestCase {
    private TaskService $tasks;
    private RuleService $rules;
    private array $taskRows = [];
    private array $alerts = [];
    private array $rule;
    private array $references = [];
    private Tenancy $tenancy;
    private array $history = [];

    protected function setUp(): void {
        $unit = new Unit(); $unit->setId(7);
        $units = $this->createMock(UnitMapper::class);
        $units->method('findByUser')->willReturn([$unit]);
        $units->method('findForUser')->willReturnCallback(fn($id, $user) => $id === 7 && $user === 'alice' ? $unit : null);
        $properties = $this->createMock(PropertyMapper::class);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $mapper = $this->createMock(TaskMapper::class);
        $mapper->method('insert')->willReturnCallback(function ($task) { $task->setId(count($this->taskRows) + 1); return $this->taskRows[$task->getId()] = clone $task; });
        $mapper->method('update')->willReturnCallback(function ($task) { return $this->taskRows[$task->getId()] = clone $task; });
        $mapper->method('findById')->willReturnCallback(fn($id) => isset($this->taskRows[$id]) ? clone $this->taskRows[$id] : null);
        $mapper->method('findOpenTasks')->willReturnCallback(fn() => array_values(array_filter($this->taskRows, fn($task) => $task->getStatus() === 'open')));
        $this->tasks = new TaskService($mapper, $properties, $units, $l10n);
        $this->rule = ['id' => 1, 'name' => 'Review', 'enabled' => true, 'months' => 36, 'scope' => 'allUnits', 'scopeIds' => [], 'autoTask' => false, 'dueDays' => 30, 'alertWarning' => 'Please review after {months} months.'];
        $rules = $this->createMock(RuleMapper::class);
        $rules->method('references')->willReturnCallback(fn() => $this->references);
        $rules->method('saveReference')->willReturnCallback(function ($id, $date) { $this->references[$id] = $date; });
        $rules->method('listRules')->willReturnCallback(fn() => [$this->rule]);
        $rules->method('locked')->willReturnCallback(fn($id, $callback) => $callback($this->rule));
        $rules->method('taskLinks')->willReturnCallback(fn() => $this->alerts);
        $rules->method('linkTask')->willReturnCallback(function ($id, $cycle, $taskId) {
            return $this->alerts[$cycle] = ['id' => count($this->alerts) + 1, 'taskId' => $taskId];
        });
        $this->tenancy = new Tenancy();
        $this->tenancy->setId(10); $this->tenancy->setUnitId(7); $this->tenancy->setStartDate('2010-01-01'); $this->tenancy->setBaseRent('900');
        $tenancies = $this->createMock(TenancyMapper::class);
        $tenancies->method('findByUser')->willReturnCallback(fn() => array_merge($this->history, [$this->tenancy]));
        $tenancies->method('findForUser')->willReturnCallback(fn($id, $user) => $id === 10 && $user === 'alice' ? $this->tenancy : null);
        $tenancies->expects(self::never())->method('update');
        $relations = $this->createMock(PartnerRelMapper::class);
        $relations->method('findForTenancies')->willReturnCallback(static function ($ids) {
            return array_map(static function ($id) {
                $relation = new \OCA\Domus\Db\PartnerRel();
                $relation->setRelationId($id); $relation->setPartnerId(7);
                return $relation;
            }, $ids);
        });
        $this->rules = new RuleService($rules, $units, $properties, $tenancies, new RentReviewEvaluator(), $this->tasks, $l10n, $relations);
    }

    public function testReferenceConfirmationWritesOnlyRuleStorage(): void {
        $before = $this->tenancy->jsonSerialize();
        $this->rules->setReference(10, '2012-01-01', 'alice');
        self::assertSame('2012-01-01', $this->references[10]);
        self::assertSame($before, $this->tenancy->jsonSerialize());
        self::assertSame('2012-01-01', $this->rules->preview($this->rule, 'alice')[0]['baselineDate']);
    }

    public function testHistoryOnlyConditionsChangeKeepsExistingTaskAndSleep(): void {
        $this->rules->evaluate('alice');
        $this->rules->remindTask(1, '6', null, 'alice');
        $sleep = $this->taskRows[1]->getDeferredUntil();
        $old = clone $this->tenancy;
        $old->setEndDate('2019-12-31');
        $this->history = [$old];
        $this->tenancy->setId(11); $this->tenancy->setStartDate('2020-01-01');
        $this->rules->evaluate('alice');
        self::assertCount(1, $this->taskRows);
        self::assertSame($sleep, $this->taskRows[1]->getDeferredUntil());
        self::assertNull($this->taskRows[1]->getRuleTenancyId());
        // A later real rent increase ends this occurrence without any tenancy write hook.
        $this->tenancy->setBaseRent('950');
        $this->tenancy->setStartDate(date('Y-m-d'));
        $old->setEndDate((new \DateTimeImmutable('yesterday'))->format('Y-m-d'));
        $this->rules->evaluate('alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
    }

    public function testForeignReferenceConfirmationIsRejected(): void {
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $this->rules->setReference(10, '2012-01-01', 'bob');
    }

    public function testFiveMinutesHidesTaskUntilRecheckAndReturnsSameTask(): void {
        $this->rules->evaluate('alice');
        self::assertSame('Please review after 36 months.', $this->taskRows[1]->getDescription());
        self::assertNull($this->taskRows[1]->getRuleTenancyId(), 'Known history does not offer a manual reference date');
        $this->taskRows[1]->setDueDate('2020-01-02');
        $now = time();
        $this->rules->remindTask(1, '5minutes', null, 'alice');
        self::assertGreaterThanOrEqual($now + 300, $this->taskRows[1]->getDeferredUntil());
        self::assertSame([], $this->tasks->listOpenTasks('alice', 'landlord'));
        $this->rules->evaluate('alice');
        self::assertSame([], $this->tasks->listOpenTasks('alice', 'landlord'));
        $this->taskRows[1]->setDeferredUntil(time() - 1);
        self::assertSame([], $this->tasks->listOpenTasks('alice', 'landlord'), 'Expiry alone must not reveal a rule task');
        $this->rules->evaluate('alice');
        self::assertCount(1, $this->tasks->listOpenTasks('alice', 'landlord'));
        self::assertCount(1, $this->taskRows);
        self::assertNull($this->taskRows[1]->getDeferredUntil());
        self::assertSame('2020-01-02', $this->taskRows[1]->getDueDate());
    }

    public function testChangedRentResolvesSleepingTaskInsteadOfReturningIt(): void {
        $this->rules->evaluate('alice');
        $this->rules->remindTask(1, '6', null, 'alice');
        $this->references[10] = date('Y-m-d');
        $this->taskRows[1]->setDeferredUntil(time() - 1);
        $this->rules->evaluate('alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
        self::assertSame([], $this->tasks->listOpenTasks('alice', 'landlord'));
    }

    public function testCompletedAndDeletedTasksStayGone(): void {
        $this->rules->evaluate('alice');
        $this->tasks->closeTask(1, 'alice');
        $this->rules->evaluate('alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
        unset($this->taskRows[1]);
        $this->rules->evaluate('alice');
        self::assertSame([], $this->taskRows);
    }

    public function testRuleDisableResolvesItsTask(): void {
        $this->rules->evaluate('alice');
        $this->rule['enabled'] = false;
        $this->rules->evaluate('alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
    }

    public function testUnknownHistoryCreatesTaskWithTenancyContext(): void {
        $this->references[10] = '';
        $this->rules->evaluate('alice');
        self::assertSame('Check rent history', $this->taskRows[1]->getTitle());
        self::assertSame(10, $this->taskRows[1]->getRuleTenancyId());
        $this->references[10] = date('Y-m-d');
        $this->rules->evaluate('alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
    }

    /** @dataProvider validChoices */
    public function testMonthAndDateChoices(string $choice, ?string $date): void {
        $this->rules->evaluate('alice');
        $this->rules->remindTask(1, $choice, $date, 'alice');
        self::assertGreaterThan(time(), $this->taskRows[1]->getDeferredUntil());
        self::assertCount(1, $this->taskRows);
    }

    public static function validChoices(): array {
        return [['1', null], ['3', null], ['6', null], ['date', '2099-01-01']];
    }

    /** @dataProvider invalidChoices */
    public function testInvalidRemindersAreRejected(string $choice, ?string $date): void {
        $this->rules->evaluate('alice');
        $this->expectException(\InvalidArgumentException::class);
        $this->rules->remindTask(1, $choice, $date, 'alice');
    }

    public static function invalidChoices(): array {
        return [['5', null], ['date', '2020-01-01'], ['date', '2027-02-30'], ['date', null]];
    }

    public function testUnauthorizedReminderIsRejected(): void {
        $this->rules->evaluate('alice');
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $this->rules->remindTask(1, '5minutes', null, 'bob');
    }

    public function testDeletingRuleCompletesTaskAndDetachesSource(): void {
        $this->rules->evaluate('alice');
        $this->rules->delete(1, 'alice');
        self::assertSame('closed', $this->taskRows[1]->getStatus());
        self::assertNull($this->taskRows[1]->getRuleId());
        self::assertNull($this->taskRows[1]->getRuleTenancyId());
    }

    public function testOrdinaryTaskCanAlsoBeDeferred(): void {
        $task = $this->tasks->createTask('unit', 7, 'Repair', '', '2020-01-02', 'alice');
        $this->rules->remindTask($task->getId(), '5minutes', null, 'alice');
        self::assertSame([], $this->tasks->listOpenTasks('alice', 'landlord'));
        self::assertSame('2020-01-02', $this->taskRows[$task->getId()]->getDueDate());
        $this->taskRows[$task->getId()]->setDeferredUntil(time() - 1);
        self::assertCount(1, $this->tasks->listOpenTasks('alice', 'landlord'));
    }
}
