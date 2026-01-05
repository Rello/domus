<?php

declare(strict_types=1);

namespace OCA\Domus\Tests\Unit;

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
use OCA\Domus\Service\WorkflowRunService;
use OCP\IDBConnection;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class WorkflowRunServiceTest extends TestCase {
    public function testStartWorkflowRunCreatesStepsAndOpensFirst(): void {
        $unit = new Unit();
        $unit->setId(7);

        $template = new TaskTemplate();
        $template->setId(3);
        $template->setName('Year End');
        $template->setIsActive(1);

        $step1 = new TaskTemplateStep();
        $step1->setTitle('Step 1');
        $step1->setDefaultDueDaysOffset(0);
        $step2 = new TaskTemplateStep();
        $step2->setTitle('Step 2');
        $step2->setDefaultDueDaysOffset(2);

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $templateMapper = $this->createMock(TaskTemplateMapper::class);
        $templateMapper->method('find')->willReturn($template);

        $templateStepMapper = $this->createMock(TaskTemplateStepMapper::class);
        $templateStepMapper->method('findByTemplate')->willReturn([$step1, $step2]);

        $workflowRun = new WorkflowRun();
        $workflowRun->setId(11);
        $workflowRun->setUnitId(7);

        $workflowRunMapper = $this->createMock(WorkflowRunMapper::class);
        $workflowRunMapper->method('findOpenRunForYear')->willReturn(null);
        $workflowRunMapper->method('insert')->willReturn($workflowRun);
        $workflowRunMapper->method('findById')->willReturn($workflowRun);

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
            $unitMapper,
            $connection,
            $l10n,
        );

        $run = $service->startWorkflowRun(7, 3, 2025, 'Year End 2025', 'user1');

        $this->assertSame(2, count($insertedSteps));
        $this->assertSame('open', $insertedSteps[0]->getStatus());
        $this->assertSame('new', $insertedSteps[1]->getStatus());
        $this->assertSame($run->getId(), $workflowRun->getId());
    }

    public function testCloseStepOpensNextOrClosesRun(): void {
        $unit = new Unit();
        $unit->setId(7);

        $openStep = new TaskStep();
        $openStep->setId(1);
        $openStep->setWorkflowRunId(99);
        $openStep->setUnitId(7);
        $openStep->setSortOrder(1);
        $openStep->setStatus('open');

        $nextStep = new TaskStep();
        $nextStep->setId(2);
        $nextStep->setWorkflowRunId(99);
        $nextStep->setUnitId(7);
        $nextStep->setSortOrder(2);
        $nextStep->setStatus('new');

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $taskStepMapper = $this->createMock(TaskStepMapper::class);
        $taskStepMapper->method('findById')->willReturn($openStep);
        $taskStepMapper->method('findNextNewStep')->willReturn($nextStep);

        $workflowRunMapper = $this->createMock(WorkflowRunMapper::class);
        $workflowRunMapper->method('findById')->willReturn(null);

        $connection = $this->createMock(IDBConnection::class);
        $connection->method('beginTransaction');
        $connection->method('commit');

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        $service = new WorkflowRunService(
            $workflowRunMapper,
            $taskStepMapper,
            $this->createMock(TaskTemplateMapper::class),
            $this->createMock(TaskTemplateStepMapper::class),
            $unitMapper,
            $connection,
            $l10n,
        );

        $service->closeStep(1, 'user1');

        $this->assertSame('closed', $openStep->getStatus());
        $this->assertSame('open', $nextStep->getStatus());
    }

    public function testDuplicateRunPreventionForYear(): void {
        $unit = new Unit();
        $unit->setId(7);

        $template = new TaskTemplate();
        $template->setId(3);
        $template->setName('Year End');
        $template->setIsActive(1);

        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $templateMapper = $this->createMock(TaskTemplateMapper::class);
        $templateMapper->method('find')->willReturn($template);

        $existingRun = new WorkflowRun();
        $existingRun->setId(88);

        $workflowRunMapper = $this->createMock(WorkflowRunMapper::class);
        $workflowRunMapper->method('findOpenRunForYear')->willReturn($existingRun);

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        $service = new WorkflowRunService(
            $workflowRunMapper,
            $this->createMock(TaskStepMapper::class),
            $templateMapper,
            $this->createMock(TaskTemplateStepMapper::class),
            $unitMapper,
            $this->createMock(IDBConnection::class),
            $l10n,
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('A workflow run for this year already exists.');

        $service->startWorkflowRun(7, 3, 2025, 'Year End 2025', 'user1');
    }
}
