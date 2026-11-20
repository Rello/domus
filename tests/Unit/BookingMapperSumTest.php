<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\BookingMapper;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;

class BookingMapperSumTest extends TestCase {
    /** @dataProvider sumQueries */
    public function testAmountSumsCastTheStringColumn(callable $query): void {
        $qb = new class {
            public const PARAM_INT = 1;
            public const PARAM_INT_ARRAY = 101;
            public array $functions = [];
            public function createFunction(string $expression): string { $this->functions[] = $expression; return $expression; }
            public function getColumnName(string $column): string { return '"' . $column . '"'; }
            public function executeQuery(): object { return new class { public function fetchAll(): array { return []; } }; }
            public function __call(string $name, array $arguments): mixed { return $this; }
        };
        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);

        $query(new BookingMapper($db));

        // PostgreSQL has no SUM over character columns, so the stored string amount must be cast.
        self::assertContains('SUM(CAST("amount" AS DECIMAL(30,10)))', $qb->functions);
        self::assertNotContains('SUM(amount)', $qb->functions);
    }

    public static function sumQueries(): array {
        return [
            'per account' => [fn(BookingMapper $mapper) => $mapper->sumByAccount('alice', 2026)],
            'grouped' => [fn(BookingMapper $mapper) => $mapper->sumByAccountGrouped('alice', null, 'unit')],
            'per year' => [fn(BookingMapper $mapper) => $mapper->sumByAccountPerYear('alice', ['2000'])],
        ];
    }
}
