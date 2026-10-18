<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Accounting\StatisticCalculations;
use OCA\Domus\Db\{Tenancy, Unit};
use OCA\Domus\Service\{StatisticsService, TenancyService};
use PHPUnit\Framework\TestCase;

class PortfolioPerformanceTest extends TestCase {
    private function dependencies(string $class): array {
        $dependencies = [];
        foreach ((new \ReflectionClass($class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['l10n']->method('t')->willReturnArgument(0);
        return $dependencies;
    }

    private function tenancy(int $id, string $start, ?string $end, string $rent): Tenancy {
        $tenancy = new Tenancy();
        $tenancy->setUnitId($id); $tenancy->setStartDate($start); $tenancy->setEndDate($end);
        $tenancy->setBaseRent($rent); $tenancy->setServiceCharge('500');
        return $tenancy;
    }

    private function fixture(?string $secondCost = '300000', bool $management = false, ?int $unitId = null): StatisticsService {
        $deps = $this->dependencies(StatisticsService::class);
        $units = [];
        foreach ([1 => '100000', 2 => $secondCost] as $id => $cost) {
            $unit = new Unit(); $unit->setId($id); $unit->setLabel('Unit ' . $id);
            $unit->setTotalCosts($cost); $unit->setPropertyId($management ? 9 : null); $units[] = $unit;
        }
        $deps['permissionService']->method('isBuildingManagement')->willReturn($management);
        $deps['unitMapper']->expects(self::once())->method('findByUser')->with('alice', $management ? 9 : null, !$management)->willReturn($units);
        $tenancies = [1 => [$this->tenancy(1, '2024-01-01', '2024-06-14', '1000'), $this->tenancy(1, '2024-06-15', '2024-12-31', '2000')],
            2 => [$this->tenancy(2, '2024-01-01', '2024-12-31', '1000')],
            99 => [$this->tenancy(99, '2024-01-01', null, '999999')]];
        $realTenancyService = new TenancyService(...array_values($this->dependencies(TenancyService::class)));
        $deps['tenancyService']->expects($unitId === 99 ? self::never() : self::once())->method('listTenanciesByUnit')->willReturn($tenancies);
        $deps['tenancyService']->method('sumTenanciesForYear')->willReturnCallback($realTenancyService->sumTenanciesForYear(...));
        $deps['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $deps['portfolioSettings']->method('getValue')->willReturn('0.3');
        $deps['bookingService']->expects($unitId === 99 ? self::never() : self::once())->method('sumByAccountGrouped')->with('alice', null, 'unit')->willReturn([
            ['unit_id' => 1, 'year' => 2024, 'account' => '2100', 'total' => 1000],
            ['unit_id' => 1, 'year' => 2024, 'account' => '2500', 'total' => 500],
            ['unit_id' => 1, 'year' => 2024, 'account' => '2600', 'total' => 2000],
            ['unit_id' => 99, 'year' => 2020, 'account' => '2100', 'total' => 999999],
        ]);
        $ids = $unitId === 99 ? [] : ($unitId === null ? [1, 2] : [$unitId]);
        $deps['bookingYearService']->method('getClosedYearsForUnits')->with($ids)->willReturn([1 => [2024 => true]]);
        $deps['bookingYearService']->method('getClosedYearsForProperties')->willReturn($management ? [9 => [2024 => true]] : []);
        return new StatisticsService(...array_values($deps));
    }

    public function testSharedFormulasProrationAndWeightedProfitability(): void {
        $report = $this->fixture()->portfolioPerformance('alice');
        $result = $report['trend'][0];
        self::assertSame(range(2024, (int)date('Y')), $report['years']);
        self::assertSame(2024, $result['year']);
        $annualRent = 5000 + 1000 * 14 / 30 + 2000 * 16 / 30 + 12000;
        $first = StatisticCalculations::calculateValues(StatisticCalculations::unitRevenue(), ['1000' => $annualRent, '2100' => 1000, '2500' => 500, '2600' => 2000, '3000' => 100000, 'taxRate' => 0.3]);
        self::assertEqualsWithDelta($first['netProfit'], $result['rows'][0]['netProfit'], 0.000001);
        $profit = $first['netProfit'] + 8400;
        self::assertEqualsWithDelta($profit, $result['netProfit'], 0.000001);
        self::assertEqualsWithDelta($profit / 400000, $result['netRentability'], 0.000001);
        self::assertNotEquals(($result['rows'][0]['netRentability'] + $result['rows'][1]['netRentability']) / 2, $result['netRentability']);
        self::assertTrue($result['isProvisional']);
        self::assertFalse($result['rows'][0]['isProvisional']);
        self::assertEqualsWithDelta($annualRent + 12000, $result['baseRent'], 0.000001);
        self::assertNotContains(2020, $report['years']);
        self::assertArrayNotHasKey('month', $report);
        self::assertArrayNotHasKey('year', $report);
    }

    public function testMissingAcquisitionCostsMakePortfolioProfitabilityUnavailable(): void {
        $result = $this->fixture(null)->portfolioPerformance('alice')['trend'][0];
        self::assertNull($result['netRentability']);
        self::assertNull($result['rows'][1]['netRentability']);
        self::assertSame(1, $result['missingCosts']);
        self::assertGreaterThan(0, $result['netProfit']);
    }

    public function testManagementPropertyClosureAndSelectedUnitScope(): void {
        $result = $this->fixture('300000', true, 2)->portfolioPerformance('alice', 9, 2, 'buildingMgmt')['trend'][0];
        self::assertSame([2], array_column($result['rows'], 'unitId'));
        self::assertSame(8400.0, $result['netProfit']);
        self::assertFalse($result['isProvisional']);
    }

    public function testForeignUnitFilterProducesAnEmptyScope(): void {
        $result = $this->fixture('300000', false, 99)->portfolioPerformance('alice', null, 99);
        self::assertSame([], $result['trend']);
        self::assertSame([], $result['years']);
        self::assertSame(0, $result['unitCount']);
    }

    public function testNoHistoryDoesNotInventYears(): void {
        $deps = $this->dependencies(StatisticsService::class);
        $unit = new Unit(); $unit->setId(1); $unit->setTotalCosts('100000');
        $deps['unitMapper']->method('findByUser')->willReturn([$unit]);
        $deps['tenancyService']->method('listTenanciesByUnit')->willReturn([]);
        $deps['bookingService']->method('sumByAccountGrouped')->willReturn([]);
        $report = (new StatisticsService(...array_values($deps)))->portfolioPerformance('alice');
        self::assertSame([], $report['trend']);
        self::assertSame([], $report['years']);
        self::assertSame(1, $report['unitCount']);
    }
}
