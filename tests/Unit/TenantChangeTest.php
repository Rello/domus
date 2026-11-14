<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Tenancy, Partner, PartnerMapper, PartnerRel, PartnerRelMapper, TaskTemplate, TaskTemplateMapper, WorkflowRun};
use OCA\Domus\Service\{TenantChangeService, WorkflowRunService};
use PHPUnit\Framework\TestCase;

class TenantChangeTest extends TestCase {
    private function tenancy(int $id, string $start): Tenancy {
        $row = new Tenancy(); $row->setId($id); $row->setUnitId(7); $row->setStartDate($start);
        return $row;
    }

    private function service(array $relations, array &$calls, bool $enabled = true, string $type = 'tenant'): TenantChangeService {
        $links = $this->createMock(PartnerRelMapper::class);
        $links->method('findForTenancy')->willReturnCallback(static fn ($id) => array_map(static function ($partnerId) {
            $row = new PartnerRel(); $row->setPartnerId($partnerId); return $row;
        }, $relations[$id] ?? []));
        $contacts = $this->createMock(PartnerMapper::class);
        $contacts->method('findForUserByIds')->willReturnCallback(static fn ($ids) => array_map(static function ($id) use ($type) {
            $row = new Partner(); $row->setId($id); $row->setName('Contact ' . $id); $row->setPartnerType($type); return $row;
        }, $ids));
        $template = new TaskTemplate(); $template->setId(20); $template->setIsActive((int)$enabled); $template->setAppliesTo('unit');
        $templates = $this->createMock(TaskTemplateMapper::class);
        $templates->method('findByKey')->with('tenant_change')->willReturn($template);
        $workflows = $this->createMock(WorkflowRunService::class);
        $workflows->method('startWorkflowRun')->willReturnCallback(function (...$args) use (&$calls) {
            $calls[] = $args; return new WorkflowRun();
        });
        return new TenantChangeService($links, $contacts, $templates, $workflows);
    }

    public function testReplacementStartsForEachDepartingContact(): void {
        $old = $this->tenancy(1, '2026-01-01'); $new = $this->tenancy(2, '2026-12-01'); $calls = [];
        $service = $this->service([1 => [3, 4], 2 => [5]], $calls);
        $service->created($new, 'alice', [$old]);
        self::assertSame([
            ['unit', 7, 20, null, 'Contact 3', 'alice', 3],
            ['unit', 7, 20, null, 'Contact 4', 'alice', 4],
        ], $calls);
    }

    public function testReplacementSelectsLatestEndedPredecessor(): void {
        $older = $this->tenancy(1, '2024-01-01'); $old = $this->tenancy(2, '2025-01-01');
        $new = $this->tenancy(3, '2026-12-01'); $calls = [];
        $service = $this->service([1 => [2], 2 => [3], 3 => [4]], $calls);
        $service->created($new, 'alice', [$old, $older]);
        self::assertCount(1, $calls); self::assertSame(3, $calls[0][6]);
    }

    public function testFirstLettingContinuationAndPartialChangeDoNotStart(): void {
        $old = $this->tenancy(1, '2026-01-01'); $new = $this->tenancy(2, '2026-12-01');
        foreach ([[3], [3, 4], []] as $incoming) {
            $calls = [];
            $this->service([1 => [3], 2 => $incoming], $calls)->created($new, 'alice', [$old]);
            self::assertSame([], $calls);
        }
        $calls = [];
        $this->service([2 => [4]], $calls)->created($new, 'alice', []);
        self::assertSame([], $calls);
    }

    public function testDisabledTemplateAndOwnerTenanciesDoNotStart(): void {
        $old = $this->tenancy(1, '2026-01-01'); $new = $this->tenancy(2, '2026-12-01'); $calls = [];
        $this->service([1 => [3], 2 => [4]], $calls, false)->created($new, 'alice', [$old]);
        $this->service([1 => [3], 2 => [4]], $calls, true, 'owner')->created($new, 'alice', [$old]);
        self::assertSame([], $calls);
    }
}
