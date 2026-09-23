<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Tenancy, TenancyMapper, Partner, PartnerMapper, PartnerRel, PartnerRelMapper, Unit, UnitMapper};
use OCA\Domus\Service\{TenancyService, PermissionService};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class TenancyServiceTest extends TestCase {
    /** @dataProvider periods */
    public function testCalendarProration(array $periods, int $year, float $expected): void {
        $rows = [];
        foreach ($periods as [$start, $end, $rent]) {
            $tenancy = new Tenancy();
            $tenancy->setStartDate($start);
            $tenancy->setEndDate($end);
            $tenancy->setBaseRent($rent);
            $tenancy->setServiceCharge($rent / 10);
            $rows[] = $tenancy;
        }
        $mapper = $this->createMock(TenancyMapper::class);
        $mapper->method('findByUser')->willReturn($rows);
        $service = new TenancyService($mapper, $this->createMock(UnitMapper::class), $this->createMock(PartnerMapper::class), $this->createMock(PartnerRelMapper::class), $this->createMock(PermissionService::class), $this->createMock(IL10N::class));
        $sums = $service->sumTenancyForYear('alice', 1, $year);
        self::assertEqualsWithDelta($expected, $sums['1000'], 0.000001);
        self::assertEqualsWithDelta($expected / 10, $sums['1001'], 0.000001);
    }

    public static function periods(): array {
        return [
            'mid-month replacement' => [[['2026-01-01', '2026-06-14', 1000], ['2026-06-15', null, 1000]], 2026, 12000.0],
            'changed rent' => [[['2026-06-01', '2026-06-14', 900], ['2026-06-15', '2026-06-30', 1200]], 2026, 1060.0],
            'leap day' => [[['2024-02-29', '2024-02-29', 290]], 2024, 10.0],
            'year boundary' => [[['2025-12-15', '2026-01-15', 310]], 2026, 150.0],
            'full open year' => [[['2025-01-01', null, 1000]], 2026, 12000.0],
            'outside year' => [[['2027-01-01', null, 1000]], 2026, 0.0],
        ];
    }

    public function testLargeListBatchesHydrationAndPreservesPartnerOrder(): void {
        $tenancies = [];
        $relations = [];
        for ($id = 1; $id <= 1000; $id++) {
            $row = new Tenancy(); $row->setId($id); $row->setUnitId(7); $row->setStartDate('2020-01-01');
            $tenancies[] = $row;
            foreach ([2, 1] as $partnerId) {
                $relation = new PartnerRel(); $relation->setRelationId($id); $relation->setPartnerId($partnerId);
                $relations[] = $relation;
            }
        }
        $mapper = $this->createMock(TenancyMapper::class);
        $mapper->expects(self::once())->method('findByUser')->with('alice', null)->willReturn($tenancies);
        $relationMapper = $this->createMock(PartnerRelMapper::class);
        $relationMapper->expects(self::never())->method('findForTenancy');
        $relationMapper->expects(self::once())->method('findForTenancies')->with(range(1, 1000), 'alice')->willReturn($relations);
        $partners = [];
        foreach ([1, 2] as $id) { $p = new Partner(); $p->setId($id); $p->setName('Partner ' . $id); $partners[] = $p; }
        $partnerMapper = $this->createMock(PartnerMapper::class);
        $partnerMapper->expects(self::once())->method('findForUserByIds')->willReturn($partners);
        $unit = new Unit(); $unit->setId(7); $unit->setLabel('Apartment');
        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->expects(self::never())->method('findForUser');
        $unitMapper->expects(self::once())->method('findForUserByIds')->willReturn([$unit]);
        $service = new TenancyService($mapper, $unitMapper, $partnerMapper, $relationMapper, $this->createMock(PermissionService::class), $this->createMock(IL10N::class));
        $result = $service->listTenancies('alice', null, 2);
        self::assertCount(1000, $result);
        self::assertSame([2, 1], $result[0]->getPartnerIds());
        self::assertSame('Partner 2', $result[0]->getPartnerName());
        self::assertSame('Apartment', $result[0]->getUnitLabel());
        self::assertSame('active', $result[0]->getStatus());
    }
}
