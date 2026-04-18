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
        $this->assertNotNull($nextStep->getDueDate());
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
