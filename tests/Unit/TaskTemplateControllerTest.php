<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Controller\TaskTemplateController;
use OCA\Domus\Db\TaskTemplateStep;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\TaskTemplateService;
use OCP\IL10N;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class TaskTemplateControllerTest extends TestCase {
    public function testAddingStepDoesNotTreatTemplateRouteIdAsStepId(): void {
        $request = $this->getMockBuilder(IRequest::class)
            ->onlyMethods(['getHeader'])->addMethods(['getParams'])->getMock();
        $request->method('getParams')->willReturn(['id' => 7, 'title' => 'New step']);
        $step = new TaskTemplateStep();
        $step->setTemplateId(7);
        $service = $this->createMock(TaskTemplateService::class);
        $service->expects(self::once())->method('addOrUpdateStep')
            ->with(7, ['title' => 'New step'])->willReturn($step);
        $access = $this->createMock(ManagementAccessContext::class);
        $access->expects(self::once())->method('managementUserId')->willReturn('owner');
        $controller = new TaskTemplateController($request, $service, $this->createMock(IL10N::class), $access);
        $response = $controller->addStep(7);
        self::assertSame(201, $response->getStatus());
        self::assertSame($step, $response->getData());
    }
    public function testSystemToggleDoesNotIncludeRouteIdInUpdatePayload(): void {
        $request = $this->getMockBuilder(IRequest::class)
            ->onlyMethods(['getHeader'])->addMethods(['getParams'])->getMock();
        $request->method('getParams')->willReturn(['id' => 7, 'isActive' => false]);
        $service = $this->createMock(TaskTemplateService::class);
        $service->expects(self::once())->method('updateTemplate')->with(7, ['isActive' => false])
            ->willReturn(new \OCA\Domus\Db\TaskTemplate());
        $access = $this->createMock(ManagementAccessContext::class);
        $access->expects(self::once())->method('managementUserId')->willReturn('owner');
        $controller = new TaskTemplateController($request, $service, $this->createMock(IL10N::class), $access);
        self::assertSame(200, $controller->update(7)->getStatus());
    }
}
