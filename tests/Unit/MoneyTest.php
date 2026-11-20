<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Accounting\Money;
use PHPUnit\Framework\TestCase;

class MoneyTest extends TestCase {
    /** @dataProvider centAmounts */
    public function testToCentsParsesStoredStringsExactly(string|int|float $amount, int $expected): void {
        self::assertSame($expected, Money::toCents($amount));
    }

    public static function centAmounts(): array {
        return [
            'whole' => ['100', 10000],
            'one decimal' => ['12.3', 1230],
            'two decimals' => ['1200.50', 120050],
            'negative' => ['-100', -10000],
            'binary inexact' => ['0.29', 29],
            'legacy half up' => ['0.225', 23],
            'legacy negative half away from zero' => ['-0.225', -23],
            'legacy below half' => ['33.333333', 3333],
            'leading point' => ['.5', 50],
            'float fallback' => [0.1 + 0.2, 30],
            'integer' => [7, 700],
        ];
    }

    public function testFromCentsAlwaysWritesTwoDecimals(): void {
        self::assertSame('0.00', Money::fromCents(0));
        self::assertSame('0.05', Money::fromCents(5));
        self::assertSame('-0.05', Money::fromCents(-5));
        self::assertSame('1200.50', Money::fromCents(120050));
    }

    /** @dataProvider negations */
    public function testNegateKeepsTheStoredValueAndNeverWritesNegativeZero(string $amount, string $expected): void {
        self::assertSame($expected, Money::negate($amount));
    }

    public static function negations(): array {
        return [
            'positive' => ['33.34', '-33.34'],
            'negative' => ['-100', '100'],
            'legacy precision' => ['33.333333', '-33.333333'],
            'zero' => ['0', '0'],
            'zero with decimals' => ['0.00', '0.00'],
            'negative zero' => ['-0', '0'],
        ];
    }

    public function testShareRoundsExactHalvesAwayFromZero(): void {
        // 0.60 EUR * 3/8 = 0.225 EUR; float multiplication of 0.6 * 0.375 rounded down to 0.22.
        self::assertSame(23, Money::share(60, 375, 1000));
        self::assertSame(-23, Money::share(-60, 375, 1000));
        self::assertSame(3333, Money::share(10000, 1, 3));
    }
}
