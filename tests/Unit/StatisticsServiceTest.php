<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;
use OCA\Domus\Service\StatisticsService;
use PHPUnit\Framework\TestCase;
class StatisticsServiceTest extends TestCase {
    public function testEmptyScopeDoesNotInventAYear(): void {
        $service = $this->service([], ['2000'], 2, 1);
        self::assertSame(['years' => [], 'series' => [], 'breakdown' => []], $service->accountTotalsByYear(['02000', '2000'], 'alice', 2, 1));
    }
    public function testDirectParentAndChildPostingsAreSeparate(): void {
        $service = $this->service([
            ['year' => 2024, 'account' => '2000', 'total' => 10],
            ['year' => 2025, 'account' => '2000', 'total' => 100],
            ['year' => 2025, 'account' => '2001', 'total' => 200],
        ], ['2000', '2001'], 2, 1);
        $result = $service->accountTotalsByYear(['02000', '2000', '2001'], 'alice', 2, 1);
        self::assertSame([2024, 2025], $result['years']);
        self::assertSame([2000 => [10.0, 100.0], 2001 => [0.0, 200.0]], $result['series']);
        self::assertCount(3, $result['breakdown']);
    }
    public function testUnitAndPropertyBreakdownReconcilesIncludingZeroNetActivity(): void {
        $service = $this->service([
            ['year' => 2025, 'account' => '2300', 'unit_id' => 1, 'property_id' => 2, 'total' => 100, 'booking_count' => 1],
            ['year' => 2025, 'account' => '2300', 'unit_id' => 3, 'property_id' => 2, 'total' => -100, 'booking_count' => 1],
            ['year' => 2025, 'account' => '2300', 'unit_id' => 4, 'property_id' => 2, 'total' => 0, 'booking_count' => 2],
            ['year' => 2025, 'account' => '2300', 'unit_id' => null, 'property_id' => 2, 'total' => 50, 'booking_count' => 1],
        ], ['2300'], 2, 1);
        $result = $service->accountTotalsByYear(['2300'], 'alice', 2, 1);
        self::assertSame([2300 => [50.0]], $result['series']);
        self::assertSame([1, 3, 4, null], array_column($result['breakdown'], 'unitId'));
        self::assertSame([100.0, -100.0, 0.0, 50.0], array_column($result['breakdown'], 'total'));
        self::assertSame([1, 1, 2, 1], array_column($result['breakdown'], 'bookingCount'));
    }
    private function service(array $rows, array $accounts, int $propertyId, int $unitId): StatisticsService {
        $dependencies = [];
        foreach ((new \ReflectionClass(StatisticsService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['bookingService']->expects(self::once())->method('sumByAccountPerYear')->with('alice', $accounts, $propertyId, $unitId)->willReturn($rows);
        return new StatisticsService(...array_values($dependencies));
    }
}
