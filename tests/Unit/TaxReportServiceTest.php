<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Booking, Tenancy, Unit};
use OCA\Domus\Service\{TaxReportService, TenancyService};
use PHPUnit\Framework\TestCase;

class TaxReportServiceTest extends TestCase {
    private function dependencies(string $class): array {
        $dependencies = [];
        foreach ((new \ReflectionClass($class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['l10n']->method('t')->willReturnArgument(0);
        return $dependencies;
    }

    private function fixture(bool $management = false): TaxReportService {
        $deps = $this->dependencies(TaxReportService::class);
        $deps['permissionService']->method('isBuildingManagement')->willReturn($management);
        $unit = new Unit(); $unit->setId(1); $unit->setLabel('Apartment'); $unit->setPropertyId(9);
        $deps['unitMapper']->expects(self::once())->method('findByUser')->with('alice', null, !$management)->willReturn([$unit]);
        $deps['bookingService']->expects(self::once())->method('sumByAccountGrouped')->with('alice', null, 'unit')->willReturn([
            ['unit_id' => 1, 'year' => 2025, 'account' => '2000', 'total' => 1509],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2100', 'total' => 242],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2110', 'total' => 10],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2111', 'total' => 5],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2300', 'total' => 5910],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2400', 'total' => 114],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2500', 'total' => 125],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2600', 'total' => 709],
            ['unit_id' => 1, 'year' => 2025, 'account' => '9000', 'total' => 543],
            ['unit_id' => 1, 'year' => 2025, 'account' => '9001', 'total' => 20],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2200', 'total' => 500],
            ['unit_id' => 1, 'year' => 2025, 'account' => '2700', 'total' => 500],
            ['unit_id' => 1, 'year' => 2024, 'account' => '2300', 'total' => 8000],
            ['unit_id' => 99, 'year' => 2001, 'account' => '2300', 'total' => 999999],
            ['unit_id' => null, 'year' => 2002, 'account' => '2300', 'total' => 999999],
        ]);
        $deps['bookingService']->expects(self::once())->method('listBookings')->with('alice', self::anything())->willReturnCallback(static function ($user, $filter) {
            $rows = $filter['year'] === 2025 ? [
                [1, 2300, 5900, 'Administration <office>'], [1, 2300, 20, 'Postage'],
                [1, 2300, -10, 'Refund'], [1, 2700, 500, null],
                [99, 2300, 99999, 'Foreign unit'], [null, 2700, 99999, 'Unallocated property'],
                [1, 2000, 1509, 'Allocable fee'],
            ] : [[1, 2300, 8000, 'Prior year']];
            return array_map(static function ($row) {
                $booking = new Booking(); $booking->setUnitId($row[0]); $booking->setAccount($row[1]);
                $booking->setAmount($row[2]); $booking->setDescription($row[3]); return $booking;
            }, $rows);
        });
        $tenancy = new Tenancy(); $tenancy->setUnitId(1); $tenancy->setBaseRent('300'); $tenancy->setServiceCharge('90');
        $tenancy->setStartDate('2025-01-01'); $tenancy->setEndDate('2025-12-31');
        $deps['tenancyService']->method('listTenanciesByUnit')->willReturn([1 => [$tenancy]]);
        $realTenancies = new TenancyService(...array_values($this->dependencies(TenancyService::class)));
        $deps['tenancyService']->method('sumTenanciesForYear')->willReturnCallback($realTenancies->sumTenanciesForYear(...));
        $deps['bookingYearService']->method('getClosedYearsForUnits')->with([1])->willReturn($management ? [] : [1 => [2025 => true]]);
        $deps['bookingYearService']->method('getClosedYearsForProperties')->with([9])->willReturn($management ? [9 => [2025 => true]] : []);
        $deps['accountService']->method('resolveTopAccountNumber')->willReturnCallback(static fn($number) => in_array($number, ['2110', '2111'], true) ? '2100' : $number);
        $deps['settlements']->expects(self::once())->method('listForUnit')->with('alice', 1, self::anything())->willReturn([
            ['saldo' => -543.004], ['saldo' => 20.004], ['saldo' => -40], ['saldo' => 10], ['saldo' => 0],
        ]);
        return new TaxReportService(...array_values($deps));
    }

    public function testWisoAmountsAndBalanceUseSelectedYearAndDoNotDoubleCountChildren(): void {
        $report = $this->fixture()->report('alice', 2025, 'landlord');
        $unit = $report['units'][0];
        self::assertTrue($unit['closed']);
        self::assertSame(3600.0, $unit['amounts']['rent']);
        self::assertSame(1080.0, $unit['amounts']['prepayments']);
        self::assertSame(6410.0, $unit['amounts']['otherCosts']);
        self::assertSame(['Administration <office>', 'Postage', 'Refund', ''], array_column($unit['otherCostBookings'], 'description'));
        self::assertSame([5900.0, 20.0, -10.0, 500.0], array_column($unit['otherCostBookings'], 'amount'));
        self::assertSame($unit['amounts']['otherCosts'], array_sum(array_column($unit['otherCostBookings'], 'amount')));
        self::assertSame(257.0, $unit['amounts']['nonAllocable']);
        self::assertSame(125.0, $unit['amounts']['interest']);
        self::assertSame(583.0, $unit['amounts']['tenantPayment']);
        self::assertSame(30.0, $unit['amounts']['tenantCredit']);
        self::assertSame(5233.0, $unit['amounts']['totalIncome']);
        self::assertSame(8415.0, $unit['amounts']['totalOperatingExpenses']);
        self::assertSame(-3891.0, $unit['amounts']['controlBalance']);
        self::assertNotContains(2001, $report['years']);
        self::assertNotContains(2002, $report['years']);
    }

    public function testPropertyClosureApplies(): void {
        $report = $this->fixture(true)->report('alice', 2025, 'buildingMgmt');
        self::assertTrue($report['units'][0]['closed']);
        self::assertSame(6410.0, $report['units'][0]['amounts']['otherCosts']);
    }

    public function testUnclosedYearStaysOpen(): void {
        $report = $this->fixture()->report('alice', 2024, 'landlord');
        self::assertFalse($report['units'][0]['closed']);
        self::assertSame(8000.0, $report['units'][0]['amounts']['otherCosts']);
        self::assertSame('Prior year', $report['units'][0]['otherCostBookings'][0]['description']);
        self::assertSame(0.0, $report['units'][0]['amounts']['rent']);
    }

    public function testInvalidYearRejectedBeforeLoadingData(): void {
        $deps = $this->dependencies(TaxReportService::class);
        $deps['unitMapper']->expects(self::never())->method('findByUser');
        $this->expectException(\InvalidArgumentException::class);
        (new TaxReportService(...array_values($deps)))->report('alice', 0, 'landlord');
    }

    public function testEmptyScopeDoesNotLoadBookingsOrSettlements(): void {
        $deps = $this->dependencies(TaxReportService::class);
        $deps['unitMapper']->method('findByUser')->willReturn([]);
        $deps['bookingService']->expects(self::never())->method('sumByAccountGrouped');
        $deps['bookingService']->expects(self::never())->method('listBookings');
        $deps['settlements']->expects(self::never())->method('listForUnit');
        $report = (new TaxReportService(...array_values($deps)))->report('alice', 2025, 'landlord');
        self::assertSame([], $report['units']);
    }
}
