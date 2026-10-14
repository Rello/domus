<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\ActionLog;
use OCA\Domus\Db\Partner;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\ActionLogService;
use PHPUnit\Framework\TestCase;

class ActionLogServiceTest extends TestCase {
    public function testPartnerActivitiesUseTheStandardListAndValidatePartnerScope(): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(ActionLogService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $partner = new Partner();
        $partner->setName('Alice');
        $dependencies['partnerMapper']->method('findForUser')->willReturnCallback(fn ($id, $user) => $id === 1 && $user === 'staff' ? $partner : null);
        $entry = new ActionLog();
        $entry->setEntityType('partner');
        $entry->setEntityId(1);
        $entry->setSource('system');
        $dependencies['actionLogMapper']->expects(self::once())->method('findByEntity')->with('staff', 'partner', 1, null, 0)->willReturn([$entry]);
        $service = new ActionLogService(...array_values($dependencies));
        self::assertSame('Alice', $service->listForEntity('staff', 'partner', 1)[0]->jsonSerialize()['entityLabel']);
        $this->expectException(\OCA\Domus\Exception\ResourceNotFoundException::class);
        $service->listForEntity('staff', 'partner', 2);
    }

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
