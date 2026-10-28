<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Support;

use OCP\IDBConnection;

/** Small in-memory database for migration contract tests, including query filters. */
class TransferDatabase implements IDBConnection {
    public array $tables = [];
    public array $reads = [];
    public int $commits = 0;
    public int $rollbacks = 0;
    private array $snapshot = [];
    public function beginTransaction(): void { $this->snapshot = $this->tables; }
    public function commit(): void { $this->commits++; }
    public function rollBack(): void { $this->tables = $this->snapshot; $this->rollbacks++; }
    public function tableExists(string $table): bool { return isset($this->tables[$table]); }
    public function getQueryBuilder(): mixed { return new TransferQuery($this); }
}

class TransferQuery {
    public const PARAM_INT = 1;
    public const PARAM_STR = 2;
    public const PARAM_NULL = 0;
    public const PARAM_INT_ARRAY = 101;
    public const PARAM_STR_ARRAY = 102;
    private string $table;
    private string $mode = 'select';
    private array $columns = [];
    private array $parameters = [];
    private array $values = [];
    private array $setValues = [];
    private mixed $condition = null;
    private int $lastId = 100;
    public function __construct(private TransferDatabase $db) {}
    public function createFunction(string $function): string { return $function; }
    public function select(...$columns): self { $this->columns = $columns; return $this; }
    public function from(string $table): self { $this->table = $table; return $this; }
    public function where(mixed $condition): self { $this->condition = $condition; return $this; }
    public function andWhere(mixed $condition): self { $this->condition = $this->condition === null ? $condition : ['and', [$this->condition, $condition]]; return $this; }
    public function setMaxResults(int $limit): self { return $this; }
    public function expr(): self { return $this; }
    public function eq(string $column, mixed $value): array { return ['eq', $column, $value]; }
    public function in(string $column, mixed $value): array { return ['in', $column, $value]; }
    public function isNull(string $column): array { return ['isNull', $column]; }
    public function isNotNull(string $column): array { return ['isNotNull', $column]; }
    public function groupBy(string $column): self { return $this; }
    public function orderBy(string $column, string $direction): self { return $this; }
    public function orX(...$conditions): array { return ['or', $conditions]; }
    public function andX(...$conditions): array { return ['and', $conditions]; }
    public function createNamedParameter(mixed $value, mixed $type = null): mixed { return $value; }
    public function createParameter(string $name): object { return (object)['name' => $name]; }
    public function setParameter(string $name, mixed $value, mixed $type): self {
        $this->parameters[$name] = $value;
        return $this;
    }
    public function insert(string $table): self { $this->table = $table; $this->mode = 'insert'; return $this; }
    public function delete(string $table): self { $this->table = $table; $this->mode = 'delete'; return $this; }
    public function update(string $table): self { $this->table = $table; $this->mode = 'update'; return $this; }
    public function set(string $column, mixed $value): self { $this->setValues[$column] = $value; return $this; }
    public function values(array $values): self { $this->values = $values; return $this; }
    public function executeStatement(): int {
        if ($this->mode === 'delete') {
            $rows = $this->db->tables[$this->table] ?? [];
            $this->db->tables[$this->table] = array_values(array_filter($rows, fn($row) => !$this->matches($row, $this->condition)));
            return count($rows) - count($this->db->tables[$this->table]);
        }
        if ($this->mode === 'update') {
            $count = 0;
            if (!isset($this->db->tables[$this->table])) {
                return 0;
            }
            foreach ($this->db->tables[$this->table] as &$row) {
                if ($this->matches($row, $this->condition)) {
                    $row = array_replace($row, $this->setValues);
                    $count++;
                }
            }
            unset($row);
            return $count;
        }
        $rows = $this->db->tables[$this->table] ?? [];
        $this->lastId = max([100, ...array_column($rows, 'id')]) + 1;
        $this->db->tables[$this->table][] = ['id' => $this->lastId] + $this->values;
        return 1;
    }
    public function getLastInsertId(): int { return $this->lastId; }
    public function executeQuery(): TransferResult {
        $this->db->reads[$this->table] = ($this->db->reads[$this->table] ?? 0) + 1;
        $rows = array_values(array_filter($this->db->tables[$this->table] ?? [], fn($row) => $this->matches($row, $this->condition)));
        return new TransferResult($rows, $this->columns);
    }
    private function matches(array $row, mixed $condition): bool {
        if ($condition === null) return true;
        if ($condition[0] === 'or') {
            foreach ($condition[1] as $part) if ($this->matches($row, $part)) return true;
            return false;
        }
        if ($condition[0] === 'and') {
            foreach ($condition[1] as $part) if (!$this->matches($row, $part)) return false;
            return true;
        }
        if ($condition[0] === 'isNull') return !isset($row[$condition[1]]);
        if ($condition[0] === 'isNotNull') return isset($row[$condition[1]]);
        $value = $condition[2];
        if (is_object($value)) $value = $this->parameters[$value->name];
        return $condition[0] === 'eq' ? ($row[$condition[1]] ?? null) === $value : in_array($row[$condition[1]] ?? null, $value, true);
    }
}

class TransferResult {
    public function __construct(private array $rows, private array $columns = []) {}
    public function fetchAll(): array { return $this->rows; }
    public function fetch(): array|false { return $this->rows[0] ?? false; }
    public function fetchOne(): mixed {
        $column = $this->columns[0] ?? 'id';
        if ($column === 'COUNT(*)') return count($this->rows);
        return $this->rows[0][$column] ?? false;
    }
    public function closeCursor(): void {}
}
