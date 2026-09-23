<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Db;

use OCA\Domus\Db\{PartnerMapper, PartnerRelMapper, UnitMapper};
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;

class BatchLookupTest extends TestCase {
    /** @dataProvider mappers */
    public function testBatchLimitsAndOwnershipFilters(string $class, string $method, string $column): void {
        $queries = [];
        $db = $this->createMock(IDBConnection::class);
        $db->expects(self::exactly(3))->method('getQueryBuilder')->willReturnCallback(function () use (&$queries) {
            $query = new class {
                public array $conditions = [];
                public function createNamedParameter($value, $type = null) { return $value; }
                public function expr() { return $this; }
                public function eq($column, $value) { return ['eq', $column, $value]; }
                public function in($column, $value) { return ['in', $column, $value]; }
                public function where($condition) { $this->conditions[] = $condition; return $this; }
                public function andWhere($condition) { $this->conditions[] = $condition; return $this; }
                public function select($columns) { return $this; }
                public function from($table) { return $this; }
            };
            $queries[] = $query;
            return $query;
        });
        $mapper = new $class($db);
        self::assertSame([], $mapper->$method([], 'alice'));
        $mapper->$method(array_merge(range(1, 1001), [1, 2]), 'alice');
        $ids = [];
        foreach ($queries as $query) {
            self::assertContains(['eq', 'user_id', 'alice'], $query->conditions);
            if ($class === PartnerRelMapper::class) {
                self::assertContains(['eq', 'type', 'tenancy'], $query->conditions);
            }
            $condition = $query->conditions[count($query->conditions) - 1];
            self::assertSame('in', $condition[0]);
            self::assertSame($column, $condition[1]);
            self::assertLessThanOrEqual(500, count($condition[2]));
            array_push($ids, ...$condition[2]);
        }
        self::assertSame(range(1, 1001), $ids);
    }

    public static function mappers(): array {
        return [
            [PartnerMapper::class, 'findForUserByIds', 'id'],
            [UnitMapper::class, 'findForUserByIds', 'id'],
            [PartnerRelMapper::class, 'findForTenancies', 'relation_id'],
        ];
    }
}
