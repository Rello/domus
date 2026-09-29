<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\ActionLog;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\ActionLogService;
use PHPUnit\Framework\TestCase;

class ActionLogServiceTest extends TestCase {
    public function testImportedActivityKeepsMissingObjectLabelWithoutNavigation(): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(ActionLogService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $unit = new Unit();
        $unit->setLabel('Unit');
        $dependencies['unitMapper']->method('findForUser')->willReturn($unit);
        $entry = new ActionLog();
        $entry->setEntityType('unit');
        $entry->setEntityId(105);
        $entry->setLinkedLabel('Original document.pdf');
        $dependencies['actionLogMapper']->method('findForUser')->willReturn($entry);
        $service = new ActionLogService(...array_values($dependencies));
        $data = $service->getEntry('target', 1)->jsonSerialize();
        $this->assertSame('Original document.pdf', $data['linkedEntity']['label']);
        $this->assertNull($data['linkedEntity']['id']);
        $this->assertNull($data['linkedEntity']['navigate']);
        $this->assertNull($data['linkedEntity']['href']);
        $entry->setLinkedLabel(null);
        $this->assertNull($service->getEntry('target', 1)->jsonSerialize()['linkedEntity']);
    }
}
