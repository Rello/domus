<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Accounting\StatisticCalculations;
use OCA\Domus\Db\{Booking, DistributionKey, Property, Tenancy, Unit};
use OCA\Domus\Service\{DistributionService, InputValidation, ServiceChargeSettlementService, StatisticsService, TenancyService};
use PHPUnit\Framework\TestCase;

class FinancialDomainTest extends TestCase {
    private function dependencies(string $class): array {
        $dependencies = [];
        foreach ((new \ReflectionClass($class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        if (isset($dependencies['l10n'])) {
            $dependencies['l10n']->method('t')->willReturnCallback(static fn($message) => $message);
        }
        return $dependencies;
    }

    /** @dataProvider settlementPartners */
    public function testSettlementAndStatisticsAgreeAcrossMidMonthReplacement(int $replacementPartnerId): void {
        $tenancies = [];
        foreach ([['2026-01-01', '2026-06-14', 1], ['2026-06-15', null, $replacementPartnerId]] as [$start, $end, $partnerId]) {
            $tenancy = new Tenancy();
            $tenancy->setId($partnerId);
            $tenancy->setStartDate($start);
            $tenancy->setEndDate($end);
            $tenancy->setBaseRent('1000');
            $tenancy->setServiceCharge('100');
            $tenancy->setPartnerIds([$partnerId]);
            $tenancies[] = $tenancy;
        }
        $dependencies = $this->dependencies(TenancyService::class);
        $service = new TenancyService(...array_values($dependencies));
        $annualSums = $service->sumTenanciesForYear($tenancies, 2026);
        $dependencies = $this->dependencies(ServiceChargeSettlementService::class);
        $dependencies['tenancyService']->method('listTenancies')->willReturn($tenancies);
        $fee = new Booking(); $fee->setAccount(2000); $fee->setAmount('1200');
        $dependencies['bookingMapper']->method('findByUser')->willReturn([$fee]);
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $entries = (new ServiceChargeSettlementService(...array_values($dependencies)))->listForUnit('alice', 1, 2026);
        self::assertEqualsWithDelta(1200, array_sum(array_column($entries, 'houseFee')), 0.000001);
        self::assertEqualsWithDelta($annualSums['1001'], array_sum(array_column($entries, 'serviceCharge')), 0.000001);
        self::assertEqualsWithDelta(12, array_sum(array_column($entries, 'months')), 0.000001);
    }

    public static function settlementPartners(): array {
        return ['same partner conditions change' => [1], 'new partner' => [2]];
    }

    /** @dataProvider settlementPartners */
    public function testSettlementBreaksDownUsedMaintenanceAccountsWithoutDoubleCounting(int $replacementPartnerId): void {
        $tenancies = [];
        foreach ([['2026-01-01', '2026-06-30', 1], ['2026-07-01', null, $replacementPartnerId]] as [$start, $end, $partnerId]) {
            $tenancy = new Tenancy();
            $tenancy->setId(count($tenancies) + 1);
            $tenancy->setStartDate($start); $tenancy->setEndDate($end);
            $tenancy->setServiceCharge('200'); $tenancy->setPartnerIds([$partnerId]);
            $tenancies[] = $tenancy;
        }
        $bookings = [];
        foreach ([['2000', '1200'], ['2001', '100'], ['2001', '80'], ['2002', '60'], ['2003', '10'], ['2003', '-10'], ['2400', '240'], ['2100', '999']] as [$account, $amount]) {
            $booking = new Booking(); $booking->setAccount($account); $booking->setAmount($amount); $bookings[] = $booking;
        }
        $deps = $this->dependencies(ServiceChargeSettlementService::class);
        $deps['tenancyService']->method('listTenancies')->willReturn($tenancies);
        $deps['bookingMapper']->method('findByUser')->willReturn($bookings);
        $deps['accountService']->method('resolveTopAccountNumber')->willReturnCallback(
            static fn($number) => in_array($number, ['2001', '2002', '2003'], true) ? '2000' : $number
        );
        $deps['accountService']->method('listAccounts')->willReturn([
            '2001' => ['label' => 'Additional | costs'], '2002' => ['label' => 'Nested costs'],
            '2003' => ['label' => 'Refunded costs'], '2004' => ['label' => 'Unused costs'],
        ]);
        $service = new ServiceChargeSettlementService(...array_values($deps));
        $entries = $service->listForUnit('alice', 1, 2026);
        self::assertSame([
            ['startDate' => '2026-01-01', 'endDate' => '2026-06-30'],
            ['startDate' => '2026-07-01', 'endDate' => null],
        ], array_merge(...array_column($entries, 'periods')));
        self::assertSame(1440.0, array_sum(array_column($entries, 'houseFee')));
        self::assertSame(720.0, array_sum(array_column($entries, 'saldo')));
        foreach ($entries as $entry) {
            self::assertSame(['2000', '2001', '2002', '2003'], array_column($entry['houseFeeItems'], 'account'));
            self::assertSame($entry['houseFee'], array_sum(array_column($entry['houseFeeItems'], 'amount')));
            $share = $entry['months'] / 12;
            self::assertSame(180.0 * $share, $entry['houseFeeItems'][1]['amount']);
            $report = (new \ReflectionMethod($service, 'buildReportMarkdown'))->invoke($service, 'Tenant', null, null, null, null, 2026, $entry);
            $suffix = $share < 1 ? ' (proportional)' : '';
            self::assertStringContainsString('| - Maintenance fee' . $suffix . ' | ' . sprintf('%.2f', 1200 * $share) . ' € |', $report);
            self::assertStringContainsString('| - Additional \| costs' . $suffix . ' | ' . sprintf('%.2f', 180 * $share) . ' € |', $report);
            self::assertStringNotContainsString('Unused costs', $report);
            self::assertStringNotContainsString(sprintf('%.2f €', $entry['houseFee']), $report);
        }
    }

    public function testCurrentTenancyExcludesFutureAndExpiredRecords(): void {
        $service = new TenancyService(...array_values($this->dependencies(TenancyService::class)));
        $rows = [];
        foreach ([['2000-01-01', '2001-01-01'], ['2002-01-01', null], ['2099-01-01', null]] as [$start, $end]) {
            $row = new Tenancy(); $row->setStartDate($start); $row->setEndDate($end); $rows[] = $row;
        }
        $unit = new Unit();
        $service->enrichUnitTenancies($unit, $rows);
        $result = $unit->jsonSerialize();
        self::assertSame([$rows[1]], $result['activeTenancies']);
        self::assertSame($rows[1], $result['currentTenancy']);
        self::assertSame([$rows[2]], $result['futureTenancies']);
        self::assertSame([$rows[0]], $result['historicTenancies']);
    }

    /** @dataProvider invalidInput */
    public function testStrictInputRejectsMalformedValues(string $kind, mixed $value): void {
        $this->expectException(\InvalidArgumentException::class);
        if ($kind === 'date') {
            InputValidation::assertDate($value, 'Invalid date');
        } else {
            InputValidation::assertMoney($value, 'Invalid money');
        }
    }

    public static function invalidInput(): array {
        return [
            ['date', '2026-02-31'], ['date', '2025-02-29'], ['date', '0000-01-01'],
            ['date', ['2026-01-01']], ['money', 'abc'], ['money', INF], ['money', NAN],
            ['money', true], ['money', '-1'], ['money', '1.234'], ['money', '1e4'],
        ];
    }

    public function testReversedPeriodIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        InputValidation::assertPeriod('2026-02-01', '2026-01-01', 'Invalid period');
    }

    public function testInlineRevenueRulesCalculateFinancialValues(): void {
        $metrics = StatisticCalculations::calculateValues(StatisticCalculations::unitRevenue(), ['1000' => 12000, '2100' => 1000, '2300' => 500, '2500' => 1000, '2600' => 2000, '2700' => 500, '3000' => 100000, 'taxRate' => 0.3]);
        self::assertSame(9500.0, $metrics['grossProfit']);
        self::assertSame(2100.0, $metrics['estimatedTaxes']);
        self::assertSame(7400.0, $metrics['netProfit']);
        self::assertSame(0.074, $metrics['netRentability']);
    }

    public function testStatisticsRoundOnlyDisplayedValues(): void {
        $dependencies = $this->dependencies(StatisticsService::class);
        $unit = new Unit(); $unit->setId(1); $unit->setTotalCosts('10');
        $dependencies['unitMapper']->method('findForUser')->willReturn($unit);
        $dependencies['tenancyService']->method('sumTenanciesForYear')->willReturn(['1000' => 10.01]);
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $dependencies['portfolioSettings']->method('getValue')->willReturn('0.1');
        $result = (new StatisticsService(...array_values($dependencies)))->unitStatPerYear(1, 'alice', 2026);
        $revenue = $result['revenue']['rows'][0];
        self::assertSame(1.0, $revenue['estimatedTaxes']);
        self::assertSame(9.01, $revenue['netProfit']);
        self::assertSame(0.9009, $revenue['netRentability']);
    }

    public function testInlineRulesResolveAccountHierarchyAndZeroDivisors(): void {
        $values = StatisticCalculations::calculateValues(StatisticCalculations::unitRevenue(),
            ['rentalIncome' => 100, 'taxRate' => 0.1], ['1000' => 'rentalIncome']);
        self::assertSame(100.0, $values['baseRent']);
        self::assertSame(90.0, $values['netProfit']);
        self::assertSame(0.0, $values['netRentability']);
    }

    public function testDistributionReportSharesPostingRoundingAndRetainsStoredAmounts(): void {
        $dependencies = $this->dependencies(DistributionService::class);
        $property = new Property(); $property->setId(1);
        $units = [];
        for ($id = 1; $id <= 3; $id++) {
            $unit = new Unit(); $unit->setId($id); $unit->setPropertyId(1); $unit->setLabel('Unit ' . $id); $units[] = $unit;
        }
        $key = new DistributionKey(); $key->setId(4); $key->setPropertyId(1); $key->setName('Equal'); $key->setType('unit'); $key->setConfigJson('{"base":3}'); $key->setValidFrom('2020-01-01');
        $booking = new Booking(); $booking->setId(10); $booking->setPropertyId(1); $booking->setDistributionKeyId(4); $booking->setAmount('100'); $booking->setAccount(2000); $booking->setDate('2026-01-01'); $booking->setYear(2026); $booking->setStatus('draft');
        $stored = [];
        $dependencies['propertyMapper']->method('findForUser')->willReturn($property);
        $dependencies['unitMapper']->method('findForUser')->willReturnCallback(static fn($id) => $units[$id - 1]);
        $dependencies['unitMapper']->method('findByUser')->willReturn($units);
        $dependencies['distributionKeyMapper']->method('findByProperty')->willReturn([$key]);
        $dependencies['distributionKeyMapper']->method('findForUser')->willReturn($key);
        $dependencies['bookingMapper']->method('findForUser')->willReturn($booking);
        $dependencies['bookingMapper']->method('findByUser')->willReturnCallback(static function () use ($booking, &$stored) { return array_merge([$booking], $stored); });
        $dependencies['bookingMapper']->method('insert')->willReturnCallback(static function ($row) use (&$stored) { $stored[] = $row; return $row; });
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $service = new DistributionService(...array_values($dependencies));
        self::assertSame(33.34, $service->buildReport(1, 3, 2026, 'alice')[0]['amount']);
        $result = $service->distribute(10, 'alice');
        self::assertSame([33.33, 33.33, 33.34], array_column($result['shares'], 'amount'));
        $key->setConfigJson('{"base":100}'); $key->setValidFrom('2099-01-01');
        self::assertSame(33.34, $service->buildReport(1, 3, 2026, 'alice')[0]['amount']);
        $reversal = clone $stored[2]; $reversal->setAmount('-33.34'); $stored[] = $reversal; $booking->setStatus('locked');
        self::assertSame(0.0, $service->buildReport(1, 3, 2026, 'alice')[0]['amount']);
    }

    public function testAllYearsLoadsTenanciesOnceAndReusesThem(): void {
        $dependencies = $this->dependencies(StatisticsService::class);
        $unit = new Unit(); $unit->setId(1); $unit->setTotalCosts('100000');
        $tenancy = new Tenancy(); $tenancy->setStartDate('2024-01-01'); $tenancy->setEndDate('2026-12-31');
        $dependencies['unitMapper']->method('findForUser')->willReturn($unit);
        $dependencies['tenancyService']->expects(self::once())->method('getTenanciesForUnit')->willReturn([$tenancy]);
        $dependencies['tenancyService']->expects(self::never())->method('sumTenancyForYear');
        $dependencies['tenancyService']->expects(self::exactly(3))->method('sumTenanciesForYear')->with([$tenancy], self::anything())->willReturn(['1000' => 12000]);
        $dependencies['bookingService']->expects(self::once())->method('sumByAccountGrouped')->willReturn([]);
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $dependencies['portfolioSettings']->expects(self::once())->method('getValue')->willReturn('0');
        $result = (new StatisticsService(...array_values($dependencies)))->unitStatsAllYears(1, 'alice');
        self::assertSame([2026, 2025, 2024], array_column($result['revenue']['rows'], 'year'));
        self::assertSame([12000.0, 12000.0, 12000.0], array_column($result['revenue']['rows'], 'netProfit'));
    }
    public function testUnitCollectionHydratesTenanciesAndPropertiesOnce(): void {
        $dependencies = $this->dependencies(\OCA\Domus\Service\UnitService::class);
        $property = new Property(); $property->setId(9); $property->setName('Shared property');
        $units = [];
        for ($id = 1; $id <= 20; $id++) {
            $unit = new Unit(); $unit->setId($id); $unit->setPropertyId(9); $units[] = $unit;
        }
        $dependencies['unitMapper']->expects(self::once())->method('findByUser')->willReturn($units);
        $dependencies['propertyMapper']->expects(self::once())->method('findByUser')->willReturn([$property]);
        $dependencies['propertyMapper']->expects(self::never())->method('findForUser');
        $dependencies['tenancyService']->expects(self::once())->method('listTenanciesByUnit')->with('alice')->willReturn([]);
        $dependencies['tenancyService']->expects(self::never())->method('listTenancies');
        $dependencies['entityImageService']->expects(self::exactly(20))->method('enrichUnit')->with(self::isInstanceOf(Unit::class), $property, true);
        $result = (new \OCA\Domus\Service\UnitService(...array_values($dependencies)))->listUnitsForUser('alice');
        self::assertCount(20, $result);
        self::assertSame('Shared property', $result[19]->jsonSerialize()['propertyName']);
    }

    public function testOverviewBatchesTenanciesAndBookingsAcrossUnits(): void {
        $dependencies = $this->dependencies(StatisticsService::class);
        $units = []; $closedYears = []; $bookings = [];
        for ($id = 1; $id <= 20; $id++) {
            $unit = new Unit(); $unit->setId($id); $unit->setTotalCosts('100000'); $units[] = $unit;
            $closedYears[$id] = [2025 => true];
            $bookings[] = ['unit_id' => $id, 'year' => 2025, 'account' => '1000', 'total' => $id * 100];
        }
        $dependencies['unitMapper']->method('findByUser')->willReturn($units);
        $dependencies['bookingYearService']->method('getClosedYearsForUnits')->willReturn($closedYears);
        $dependencies['tenancyService']->expects(self::once())->method('listTenanciesByUnit')->willReturn([]);
        $dependencies['tenancyService']->expects(self::never())->method('getTenanciesForUnit');
        $dependencies['tenancyService']->expects(self::never())->method('sumTenancyForYear');
        $dependencies['tenancyService']->method('sumTenanciesForYear')->willReturn([]);
        $dependencies['bookingService']->expects(self::once())->method('sumByAccountGrouped')->with('alice', null, 'unit')->willReturn($bookings);
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $dependencies['portfolioSettings']->expects(self::once())->method('getValue')->willReturn('0');
        $result = (new StatisticsService(...array_values($dependencies)))->unitOverview(2026, 'alice');
        self::assertCount(20, $result['rows']);
        self::assertSame(100.0, $result['rows'][0]['baseRent']);
        self::assertSame(2000.0, $result['rows'][19]['baseRent']);
        self::assertSame(2025, $result['rows'][19]['year']);
    }
    /** @dataProvider invalidBookingInput */
    public function testBookingServiceRejectsInvalidFinancialInput(array $override): void {
        $dependencies = $this->dependencies(\OCA\Domus\Service\BookingService::class);
        $dependencies['unitMapper']->method('findForUser')->willReturn(new Unit());
        $dependencies['bookingMapper']->expects(self::never())->method('insert');
        $this->expectException(\InvalidArgumentException::class);
        (new \OCA\Domus\Service\BookingService(...array_values($dependencies)))->createBooking(array_merge([
            'date' => '2026-01-01', 'deliveryDate' => '2026-01-01', 'amount' => '100', 'account' => '2000', 'unitId' => 1,
        ], $override), 'alice');
    }

    public static function invalidBookingInput(): array {
        return [[['date' => '2026-02-31']], [['amount' => 'abc']], [['periodFrom' => '2026-03-01', 'periodTo' => '2026-02-01']]];
    }
    public function testSettlementUsesTheSamePropertyTaxAccountAsStatistics(): void {
        $tenancy = new Tenancy();
        $tenancy->setId(1); $tenancy->setStartDate('2026-01-01');
        $tenancy->setServiceCharge('100'); $tenancy->setPartnerIds([1]);
        $tax = new Booking(); $tax->setAccount(2400); $tax->setAmount('600');
        $deps = $this->dependencies(ServiceChargeSettlementService::class);
        $deps['tenancyService']->method('listTenancies')->willReturn([$tenancy]);
        $deps['bookingMapper']->method('findByUser')->willReturn([$tax]);
        $deps['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $actual = (new ServiceChargeSettlementService(...array_values($deps)))->listForUnit('alice', 1, 2026)[0];
        $shared = StatisticCalculations::calculateValues(StatisticCalculations::unitCost(), ['1001' => 1200, '2400' => 600]);
        self::assertSame(600.0, $actual['propertyTax']);
        self::assertSame($shared['tenantBalance'], $actual['saldo']);
        self::assertSame(600.0, $shared['tenantBalance']);
    }

    /** @dataProvider partialDistributions */
    public function testPartialDistributionLeavesUnrepresentedShareUnallocated(string $amount, array $areas, array $expected): void {
        $property = new Property(); $property->setId(1);
        $units = [];
        foreach ([1, 2] as $id) {
            $unit = new Unit(); $unit->setId($id); $unit->setPropertyId(1); $unit->setLabel('Unit ' . $id); $unit->setLivingArea($areas[$id - 1]);
            $units[] = $unit;
        }
        $key = new DistributionKey(); $key->setId(4); $key->setPropertyId(1); $key->setName('Living area');
        $key->setType('area'); $key->setConfigJson('{"base":1000}'); $key->setValidFrom('2020-01-01');
        $booking = new Booking(); $booking->setId(10); $booking->setPropertyId(1); $booking->setDistributionKeyId(4);
        $booking->setAmount($amount); $booking->setAccount(2000); $booking->setDate('2026-01-01'); $booking->setYear(2026); $booking->setStatus('draft');
        $deps = $this->dependencies(DistributionService::class);
        $deps['propertyMapper']->method('findForUser')->willReturn($property);
        $deps['unitMapper']->method('findForUser')->willReturnCallback(static fn($id) => $units[$id - 1]);
        $deps['unitMapper']->method('findByUser')->willReturn($units);
        $deps['distributionKeyMapper']->method('findByProperty')->willReturn([$key]);
        $deps['bookingMapper']->method('findByUser')->willReturn([$booking]);
        $deps['bookingMapper']->method('findForUser')->willReturn($booking);
        $deps['bookingMapper']->method('insert')->willReturnArgument(0);
        $deps['distributionKeyMapper']->method('findForUser')->willReturn($key);
        $deps['accountService']->method('resolveTopAccountNumber')->willReturnArgument(0);
        $service = new DistributionService(...array_values($deps));
        $first = $service->buildReport(1, 1, 2026, 'alice')[0];
        $last = $service->buildReport(1, 2, 2026, 'alice')[0];
        self::assertSame($expected[0], $first['amount']);
        self::assertSame($expected[1], $last['amount']);
        self::assertSame((float)$areas[1] / 1000, $last['weight']);
        self::assertSame($expected, array_column($service->distribute(10, 'alice')['shares'], 'amount'));
    }

    public static function partialDistributions(): array {
        return [
            'partial base' => ['100', ['100', '100'], [10.0, 10.0]],
            'refund' => ['-100', ['100', '100'], [-10.0, -10.0]],
            'zero last share' => ['100', ['100', '0'], [10.0, 0.0]],
            'no represented share' => ['100', ['0', '0'], [0.0, 0.0]],
        ];
    }
}
