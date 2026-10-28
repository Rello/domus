<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TaskStep;
use OCA\Domus\Db\TaskStepMapper;
use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\TaskTemplateStep;
use OCA\Domus\Db\TaskTemplateStepMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\WorkflowRun;
use OCA\Domus\Db\WorkflowRunMapper;
use OCA\Domus\Service\EntityImageService;
use OCA\Domus\Service\WorkflowRunService;
use OCP\IDBConnection;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class WorkflowRunServiceTest extends TestCase {
    /** @dataProvider portfolioSizes */
    public function testDashboardBatchesRunRetrieval(int $count): void {
        $unit = new Unit(); $unit->setId(7);
        $units = $this->createMock(UnitMapper::class); $units->method('findByUser')->willReturn([$unit]);
        $rows = [];
        for ($id = 1; $id <= $count; $id++) {
            $step = new TaskStep(); $step->setId($id); $step->setWorkflowRunId($id);
            $step->setEntityType('unit'); $step->setEntityId(7); $rows[] = $step;
        }
        $steps = $this->createMock(TaskStepMapper::class);
        $steps->expects(self::once())->method('findOpenStepsByEntities')->willReturn($rows);
        $run = new WorkflowRun(); $run->setId(1); $run->setName('Annual review'); $run->setYear(2026);
        $runs = $this->createMock(WorkflowRunMapper::class);
        $runs->expects(self::never())->method('findById');
        $runs->expects(self::once())->method('findByIds')->with(range(1, $count))->willReturn([$run]);
        $service = new WorkflowRunService($runs, $steps, $this->createMock(TaskTemplateMapper::class), $this->createMock(TaskTemplateStepMapper::class), $this->createMock(PropertyMapper::class), $units, $this->createMock(EntityImageService::class), $this->createMock(IDBConnection::class), $this->createMock(IL10N::class));
        $result = $service->listOpenStepsForUser('alice', 'landlord');
        self::assertCount($count, $result);
        self::assertSame('Annual review', $result[0]['workflowName']);
        self::assertSame(2026, $result[0]['year']);
    }

    public static function portfolioSizes(): array { return [[1], [1000]]; }

    /** @dataProvider reminderCases */
    public function testStepReminder(string $status, bool $authorized, string $choice): void {
        $step = new TaskStep();
        $step->setId(91);
        $step->setEntityType('unit');
        $step->setEntityId(7);
        $step->setStatus($status);
        $step->setDueDate('2020-01-02');
        $steps = $this->createMock(TaskStepMapper::class);
        $steps->method('findById')->willReturn($step);
        $units = $this->createMock(UnitMapper::class);
        $units->method('findForUser')->willReturn($authorized ? new Unit() : null);
        $valid = $authorized && $status === 'open' && $choice === '5minutes';
        $steps->expects($valid ? self::once() : self::never())->method('update')->willReturnArgument(0);
        $service = new WorkflowRunService(
            $this->createMock(WorkflowRunMapper::class), $steps,
            $this->createMock(TaskTemplateMapper::class), $this->createMock(TaskTemplateStepMapper::class),
            $this->createMock(PropertyMapper::class), $units, $this->createMock(EntityImageService::class),
            $this->createMock(IDBConnection::class), $this->createMock(IL10N::class)
        );
        if (!$valid) $this->expectException(\Throwable::class);
        $now = time();
        $result = $service->remindStep(91, $choice, null, 'alice');
        self::assertSame('open', $result->getStatus());
        self::assertSame(date('Y-m-d', $result->getDeferredUntil()), $result->getDueDate());
        self::assertGreaterThanOrEqual($now + 300, $result->getDeferredUntil());
    }

    public static function reminderCases(): array {
        return [['open', true, '5minutes'], ['closed', true, '5minutes'], ['new', true, '5minutes'], ['open', false, '5minutes'], ['open', true, 'invalid']];
    }

    public function testSleepingStepsStayAccessibleAndReturnAfterExpiry(): void {
        $unit = new Unit(); $unit->setId(7);
        $units = $this->createMock(UnitMapper::class);
        $units->method('findByUser')->willReturn([$unit]);
        $step = new TaskStep();
        $step->setId(91); $step->setWorkflowRunId(90);
        $step->setEntityType('unit'); $step->setEntityId(7);
        $step->setStatus('open'); $step->setDueDate('2020-01-02');
        $step->setDeferredUntil(time() + 300);
        $steps = $this->createMock(TaskStepMapper::class);
        $steps->method('findOpenStepsByEntities')->willReturn([$step]);
        $service = new WorkflowRunService(
            $this->createMock(WorkflowRunMapper::class), $steps,
            $this->createMock(TaskTemplateMapper::class), $this->createMock(TaskTemplateStepMapper::class),
            $this->createMock(PropertyMapper::class), $units, $this->createMock(EntityImageService::class),
            $this->createMock(IDBConnection::class), $this->createMock(IL10N::class)
        );
        self::assertSame([], $service->listOpenStepsForUser('alice', 'landlord'));
        self::assertCount(1, $service->listOpenStepsForUser('alice', 'landlord', true));
        $step->setDeferredUntil(time() - 1);
        $returned = $service->listOpenStepsForUser('alice', 'landlord');
        self::assertCount(1, $returned);
        self::assertSame(91, $returned[0]['stepId']);
        self::assertSame(date('Y-m-d', $step->getDeferredUntil()), $returned[0]['dueDate']);
    }

    public function testStartWorkflowRunCreatesStepsAndOpensFirst(): void {
        $unit = new Unit();
        $unit->setId(7);

        $template = new TaskTemplate();
        $template->setId(3);
        $template->setName('Year End');
        $template->setAppliesTo('unit');
        $template->setIsActive(1);

        $step1 = new TaskTemplateStep();
        $step1->setSortOrder(1);
        $step1->setTitle('Step 1');
        $step1->setDefaultDueDaysOffset(0);
        $step2 = new TaskTemplateStep();
        $step2->setSortOrder(2);
        $step2->setTitle('Step 2');
        $step2->setAllowEarlyCompletion(1);
        $step2->setDefaultDueDaysOffset(2);

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $templateMapper = $this->createMock(TaskTemplateMapper::class);
        $templateMapper->method('findById')->willReturn($template);

        $templateStepMapper = $this->createMock(TaskTemplateStepMapper::class);
        $templateStepMapper->method('findByTemplate')->willReturn([$step1, $step2]);

        $workflowRun = null;

        $workflowRunMapper = $this->createMock(WorkflowRunMapper::class);
        $workflowRunMapper->method('insert')->willReturnCallback(function (WorkflowRun $run) use (&$workflowRun) {
            $run->setId(11);
            $workflowRun = $run;
            return $run;
        });
        $workflowRunMapper->method('findById')->willReturnCallback(function () use (&$workflowRun) {
            return $workflowRun;
        });

        $insertedSteps = [];
        $taskStepMapper = $this->createMock(TaskStepMapper::class);
        $taskStepMapper->method('insert')->willReturnCallback(function (TaskStep $step) use (&$insertedSteps) {
            $insertedSteps[] = $step;
            return $step;
        });
        $taskStepMapper->method('findByRun')->willReturn($insertedSteps);

        $connection = $this->createMock(IDBConnection::class);
        $connection->method('beginTransaction');
        $connection->method('commit');

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        $service = new WorkflowRunService(
            $workflowRunMapper,
            $taskStepMapper,
            $templateMapper,
            $templateStepMapper,
            $this->createMock(PropertyMapper::class),
            $unitMapper,
            $this->createMock(EntityImageService::class),
            $connection,
            $l10n,
        );

        $run = $service->startWorkflowRun('unit', 7, 3, 2025, 'Year End 2025', 'user1');

        $this->assertSame(2, count($insertedSteps));
        $this->assertSame('unit', $insertedSteps[0]->getEntityType());
        $this->assertSame(7, $insertedSteps[0]->getEntityId());
        $this->assertSame('open', $insertedSteps[0]->getStatus());
        $this->assertSame('new', $insertedSteps[1]->getStatus());
        $this->assertSame(0, $insertedSteps[0]->getAllowEarlyCompletion());
        $this->assertSame(1, $insertedSteps[1]->getAllowEarlyCompletion());
        $this->assertSame(2, $insertedSteps[1]->getDefaultDueDaysOffset());
        $step2->setDefaultDueDaysOffset(99);
        $this->assertSame(2, $insertedSteps[1]->getDefaultDueDaysOffset());
        $step2->setAllowEarlyCompletion(0);
        $this->assertSame(1, $insertedSteps[1]->getAllowEarlyCompletion());
        $this->assertSame(2, $insertedSteps[1]->getDefaultDueDaysOffset());
        $step2->setDefaultDueDaysOffset(99);
        $this->assertSame(2, $insertedSteps[1]->getDefaultDueDaysOffset());
        $this->assertNotNull($insertedSteps[0]->getDueDate());
        $this->assertNull($insertedSteps[1]->getDueDate());
        $this->assertSame($run->getId(), $workflowRun->getId());
    }

    public function testCloseStepOpensNextOrClosesRun(): void {
        $unit = new Unit();
        $unit->setId(7);

        $openStep = new TaskStep();
        $openStep->setId(1);
        $openStep->setWorkflowRunId(99);
        $openStep->setEntityType('unit');
        $openStep->setEntityId(7);
        $openStep->setSortOrder(1);
        $openStep->setStatus('open');

        $nextStep = new TaskStep();
        $nextStep->setId(2);
        $nextStep->setWorkflowRunId(99);
        $nextStep->setEntityType('unit');
        $nextStep->setEntityId(7);
        $nextStep->setSortOrder(2);
        $nextStep->setStatus('new');
        $nextStep->setDefaultDueDaysOffset(5);

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $taskStepMapper = $this->createMock(TaskStepMapper::class);
        $taskStepMapper->method('findById')->willReturn($openStep);
        $taskStepMapper->method('findNextNewStep')->willReturn($nextStep);

        $workflowRun = new WorkflowRun();
        $workflowRun->setId(99);
        $workflowRun->setTemplateId(3);

        $workflowRunMapper = $this->createMock(WorkflowRunMapper::class);
        $workflowRunMapper->method('findById')->willReturn($workflowRun);

        $templateStep = new TaskTemplateStep();
        $templateStep->setDefaultDueDaysOffset(2);

        $connection = $this->createMock(IDBConnection::class);
        $connection->method('beginTransaction');
        $connection->method('commit');

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        $service = new WorkflowRunService(
            $workflowRunMapper,
            $taskStepMapper,
            $this->createMock(TaskTemplateMapper::class),
            $this->createConfiguredMock(TaskTemplateStepMapper::class, [
                'findByTemplateAndSortOrder' => $templateStep,
            ]),
            $this->createMock(PropertyMapper::class),
            $unitMapper,
            $this->createMock(EntityImageService::class),
            $connection,
            $l10n,
        );

        $service->closeStep(1, 'user1');

        $this->assertSame('closed', $openStep->getStatus());
        $this->assertSame('open', $nextStep->getStatus());
        $this->assertSame(date('Y-m-d', strtotime('+5 days')), $nextStep->getDueDate());
    }

    public function testReopenCompletedProcessWithoutAnOpenStep(): void {
        $unit = new Unit();
        $unit->setId(7);
        $step = new TaskStep();
        $step->setId(1);
        $step->setWorkflowRunId(99);
        $step->setEntityType('unit');
        $step->setEntityId(7);
        $step->setSortOrder(1);
        $step->setStatus('closed');
        $step->setDefaultDueDaysOffset(7);
        $step->setClosedAt(100);
        $step->setClosedBy('user1');
        $run = new WorkflowRun();
        $run->setId(99);
        $run->setTemplateId(3);
        $run->setStatus('closed');
        $run->setClosedAt(100);

        $query = new class {
            public const PARAM_INT = 1;
            public function __call(string $name, array $args): self {
                return $this;
            }
        };
        $connection = $this->createMock(IDBConnection::class);
        $connection->method('getQueryBuilder')->willReturn($query);
        $connection->expects($this->once())->method('commit');
        $connection->expects($this->never())->method('rollBack');
        // Keep the real optional lookup: Nextcloud's singular finder throws for
        // zero rows, whereas the collection finder returns an empty array.
        $stepMapper = $this->getMockBuilder(TaskStepMapper::class)
            ->setConstructorArgs([$connection])
            ->onlyMethods(['findById', 'findEntities', 'findEntity', 'update'])
            ->getMock();
        $stepMapper->method('findById')->willReturn($step);
        $stepMapper->expects($this->once())->method('findEntities')->willReturn([]);
        $stepMapper->expects($this->never())->method('findEntity');
        $stepMapper->expects($this->once())->method('update')->with($step)->willReturn($step);
        $runMapper = $this->createMock(WorkflowRunMapper::class);
        $runMapper->method('findById')->willReturn($run);
        $runMapper->expects($this->once())->method('update')->with($run)->willReturn($run);
        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);
        $service = new WorkflowRunService(
            $runMapper, $stepMapper, $this->createMock(TaskTemplateMapper::class),
            $this->createMock(TaskTemplateStepMapper::class),
            $this->createMock(PropertyMapper::class), $unitMapper,
            $this->createMock(EntityImageService::class), $connection, $l10n,
        );

        $this->assertSame($step, $service->reopenStep(1, 'user1'));
        $this->assertSame('open', $step->getStatus());
        $this->assertNull($step->getClosedAt());
        $this->assertNull($step->getClosedBy());
        $this->assertSame(date('Y-m-d', strtotime('+7 days')), $step->getDueDate());
        $this->assertSame('open', $run->getStatus());
        $this->assertNull($run->getClosedAt());
    }

    private function earlyCompletionFixture(): array {
        $unit = new Unit();
        $unit->setId(7);
        $steps = [];
        foreach (['closed', 'open', 'new'] as $index => $status) {
            $step = new TaskStep();
            $step->setId($index + 1);
            $step->setWorkflowRunId(99);
            $step->setEntityType('unit');
            $step->setEntityId(7);
            $step->setSortOrder($index + 1);
            $step->setStatus($status);
            $step->setAllowEarlyCompletion($index === 1 ? 1 : 0);
            $steps[] = $step;
        }
        $steps[0]->setClosedAt(100);
        $steps[0]->setClosedBy('previousUser');
        $run = new WorkflowRun();
        $run->setId(99);
        $run->setTemplateId(3);
        $run->setStatus('open');
        $runMapper = $this->createMock(WorkflowRunMapper::class);
        $runMapper->method('findById')->willReturn($run);
        $stepMapper = $this->createMock(TaskStepMapper::class);
        $stepMapper->method('findById')->willReturnCallback(fn($id) => $steps[$id - 1]);
        $stepMapper->method('findByRun')->willReturn($steps);
        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);
        $connection = $this->createMock(IDBConnection::class);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);
        $service = new WorkflowRunService(
            $runMapper, $stepMapper, $this->createMock(TaskTemplateMapper::class),
            $this->createMock(TaskTemplateStepMapper::class), $this->createMock(PropertyMapper::class),
            $unitMapper, $this->createMock(EntityImageService::class), $connection, $l10n,
        );
        return [$service, $run, $steps, $stepMapper, $connection];
    }

    public function testCloseEarlyPreservesHistoryAndReopenRestoresRemainingWork(): void {
        [$service, $run, $steps, , $connection] = $this->earlyCompletionFixture();
        $connection->expects($this->exactly(2))->method('commit');
        $service->closeEarly(2, 'user1');
        $this->assertSame('closed', $run->getStatus());
        $this->assertSame('early', $run->getCompletionType());
        $this->assertSame('user1', $run->getClosedBy());
        $this->assertNotNull($run->getClosedAt());
        $this->assertSame(['closed', 'skipped', 'skipped'], array_map(fn($step) => $step->getStatus(), $steps));
        $this->assertSame(100, $steps[0]->getClosedAt());
        $this->assertSame('previousUser', $steps[0]->getClosedBy());
        $this->assertNull($steps[1]->getClosedAt());
        $this->assertNull($steps[2]->getClosedBy());
        $service->reopenStep(2, 'user1');
        $this->assertSame(['closed', 'open', 'new'], array_map(fn($step) => $step->getStatus(), $steps));
        $this->assertSame('open', $run->getStatus());
        $this->assertNull($run->getCompletionType());
        $this->assertNull($run->getClosedBy());
        $this->assertNull($run->getClosedAt());
    }

    public function testCloseEarlyRejectsUnconfiguredAndNonCurrentSteps(): void {
        foreach ([1, 2, 3] as $id) {
            [$service, , $steps, $mapper, $connection] = $this->earlyCompletionFixture();
            $steps[1]->setAllowEarlyCompletion(0);
            $mapper->expects($this->never())->method('update');
            $connection->expects($this->never())->method('beginTransaction');
            try {
                $service->closeEarly($id, 'user1');
                $this->fail('Unconfigured or non-current step was accepted');
            } catch (\InvalidArgumentException $e) {
                $this->assertSame('Early completion is not allowed for this step.', $e->getMessage());
            }
        }
    }

    public function testCloseEarlyRollsBackOnFailure(): void {
        [$service, , , $mapper, $connection] = $this->earlyCompletionFixture();
        $mapper->method('update')->willThrowException(new \RuntimeException('Write failed'));
        $connection->expects($this->once())->method('rollBack');
        $connection->expects($this->never())->method('commit');
        $this->expectExceptionMessage('Write failed');
        $service->closeEarly(2, 'user1');
    }

    public function testLaterSkippedStepCannotBypassResumePoint(): void {
        [$service, , , , $connection] = $this->earlyCompletionFixture();
        $service->closeEarly(2, 'user1');
        $connection->expects($this->never())->method('beginTransaction');
        $this->expectException(\InvalidArgumentException::class);
        $service->reopenStep(3, 'user1');
    }

    public function testStartWorkflowRunRejectsTemplateForWrongEntityType(): void {
        $unit = new Unit();
        $unit->setId(7);

        $template = new TaskTemplate();
        $template->setId(3);
        $template->setName('Year End');
        $template->setAppliesTo('property');
        $template->setIsActive(1);

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $templateMapper = $this->createMock(TaskTemplateMapper::class);
        $templateMapper->method('findById')->willReturn($template);

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        $service = new WorkflowRunService(
            $this->createMock(WorkflowRunMapper::class),
            $this->createMock(TaskStepMapper::class),
            $templateMapper,
            $this->createMock(TaskTemplateStepMapper::class),
            $this->createMock(PropertyMapper::class),
            $unitMapper,
            $this->createMock(EntityImageService::class),
            $this->createMock(IDBConnection::class),
            $l10n,
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Template does not match the selected entity type.');

        $service->startWorkflowRun('unit', 7, 3, 2025, 'Year End 2025', 'user1');
    }
}
