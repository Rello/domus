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
        self::assertSame(['years' => [], 'series' => []], $service->accountTotalsByYear(['02000', '2000'], 'alice', 2, 1));
    }
    public function testDirectParentAndChildPostingsAreSeparate(): void {
        $service = $this->service([
            ['year' => 2024, 'account' => '2000', 'total' => 10],
            ['year' => 2025, 'account' => '2000', 'total' => 100],
            ['year' => 2025, 'account' => '2001', 'total' => 200],
        ], ['2000', '2001'], 2, 1);
        self::assertSame(['years' => [2024, 2025], 'series' => [2000 => [10.0, 100.0], 2001 => [0.0, 200.0]]], $service->accountTotalsByYear(['02000', '2000', '2001'], 'alice', 2, 1));
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
