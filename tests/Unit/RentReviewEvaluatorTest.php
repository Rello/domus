<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Tenancy;
use OCA\Domus\Service\RentReviewEvaluator;
use PHPUnit\Framework\TestCase;

class RentReviewEvaluatorTest extends TestCase {
    /** @dataProvider periods */
    public function testCalendarBoundary(?string $since, string $today, int $months, string $status, ?string $due): void {
        $tenancy = new Tenancy(); $tenancy->setId(1); $tenancy->setStartDate('2000-01-01');
        $result = (new RentReviewEvaluator())->evaluate($tenancy, $months, new \DateTimeImmutable($today), [], $since === null ? [] : [1 => $since]);
        self::assertSame($status, $result['status']); self::assertSame($due, $result['dueDate']);
    }
    public static function periods(): array {
        return [
            ['2023-10-16', '2026-10-15', 36, 'ok', '2026-10-16'],
            ['2023-10-16', '2026-10-16', 36, 'due', '2026-10-16'],
            ['2024-02-29', '2025-02-28', 12, 'due', '2025-02-28'],
            ['2024-01-31', '2024-02-29', 1, 'due', '2024-02-29'],
            [null, '2026-10-16', 36, 'due', '2003-01-01'],
            ['', '2026-10-16', 36, 'unknown', null],
            ['2027-01-01', '2026-10-16', 36, 'unknown', null],
        ];
    }
    public function testInactiveTenanciesAreIgnored(): void {
        $tenancy = new Tenancy(); $tenancy->setStartDate('2027-01-01');
        $evaluator = new RentReviewEvaluator(); $today = new \DateTimeImmutable('2026-10-16');
        self::assertNull($evaluator->evaluate($tenancy, 36, $today));
        $tenancy->setStartDate('2020-01-01'); $tenancy->setEndDate('2026-10-15');
        self::assertNull($evaluator->evaluate($tenancy, 36, $today));
    }
    public function testExistingRentHistoryIgnoresConditionsOnlyChanges(): void {
        $make = static function ($id, $start, $end, $rent, $partner = 7) {
            $row = new Tenancy(); $row->setId($id); $row->setUnitId(2);
            $row->setStartDate($start); $row->setEndDate($end); $row->setBaseRent($rent);
            $row->setPartnerIds([$partner]);
            return $row;
        };
        $old = $make(3, '2012-01-01', '2012-07-31', '248.69');
        $increase = $make(4, '2013-01-01', '2024-12-31', '285.99');
        $current = $make(5, '2025-01-01', null, '285.99');
        $history = [$current, $old, $increase];
        $evaluator = new RentReviewEvaluator(); $today = new \DateTimeImmutable('2026-10-16');
        $result = $evaluator->evaluate($current, 36, $today, $history);
        self::assertSame('2013-01-01', $result['baselineDate']);
        self::assertSame('2016-01-01', $result['dueDate']);
        $current->setBaseRent('270'); // Decreases do not reset an increase rule.
        self::assertSame('2013-01-01', $evaluator->evaluate($current, 36, $today, $history)['baselineDate']);
        $current->setBaseRent('300');
        self::assertSame('2025-01-01', $evaluator->evaluate($current, 36, $today, $history)['baselineDate']);
        $current->setBaseRent('285.99'); $current->setPartnerIds([8]);
        self::assertSame('2025-01-01', $evaluator->evaluate($current, 36, $today, $history)['baselineDate']);
        $current->setPartnerIds([7]);
        self::assertSame('2020-01-01', $evaluator->evaluate($current, 36, $today, $history, [5 => '2020-01-01'])['baselineDate']);
        self::assertSame('unknown', $evaluator->evaluate($current, 36, $today, $history, [5 => ''])['status']);
    }
}
