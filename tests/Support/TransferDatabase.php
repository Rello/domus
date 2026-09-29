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
    public int $commits = 0;
    public int $rollbacks = 0;
    private array $snapshot = [];
    public function beginTransaction(): void { $this->snapshot = $this->tables; }
    public function commit(): void { $this->commits++; }
    public function rollBack(): void { $this->tables = $this->snapshot; $this->rollbacks++; }
    public function getQueryBuilder(): mixed { return new TransferQuery($this); }
}

class TransferQuery {
    private string $table;
    private array $parameters = [];
    private array $values = [];
    private mixed $condition = null;
    private int $lastId = 100;
    public function __construct(private TransferDatabase $db) {}
    public function select(...$columns): self { return $this; }
    public function from(string $table): self { $this->table = $table; return $this; }
    public function where(mixed $condition): self { $this->condition = $condition; return $this; }
    public function setMaxResults(int $limit): self { return $this; }
    public function expr(): self { return $this; }
    public function eq(string $column, mixed $value): array { return ['eq', $column, $value]; }
    public function in(string $column, mixed $value): array { return ['in', $column, $value]; }
    public function orX(...$conditions): array { return ['or', $conditions]; }
    public function createNamedParameter(mixed $value): mixed { return $value; }
    public function createParameter(string $name): object { return (object)['name' => $name]; }
    public function setParameter(string $name, mixed $value, mixed $type): self {
        $this->parameters[$name] = $value;
        return $this;
    }
    public function insert(string $table): self { $this->table = $table; return $this; }
    public function values(array $values): self { $this->values = $values; return $this; }
    public function executeStatement(): int {
        $rows = $this->db->tables[$this->table] ?? [];
        $this->lastId = max([100, ...array_column($rows, 'id')]) + 1;
        $this->db->tables[$this->table][] = ['id' => $this->lastId] + $this->values;
        return 1;
    }
    public function getLastInsertId(): int { return $this->lastId; }
    public function executeQuery(): TransferResult {
        $rows = array_values(array_filter($this->db->tables[$this->table] ?? [], fn($row) => $this->matches($row, $this->condition)));
        return new TransferResult($rows);
    }
    private function matches(array $row, mixed $condition): bool {
        if ($condition === null) return true;
        if ($condition[0] === 'or') {
            foreach ($condition[1] as $part) if ($this->matches($row, $part)) return true;
            return false;
        }
        $value = $condition[2];
        if (is_object($value)) $value = $this->parameters[$value->name];
        return $condition[0] === 'eq' ? ($row[$condition[1]] ?? null) === $value : in_array($row[$condition[1]] ?? null, $value, true);
    }
}

class TransferResult {
    public function __construct(private array $rows) {}
    public function fetchAll(): array { return $this->rows; }
    public function fetchOne(): mixed { return $this->rows[0]['id'] ?? false; }
    public function closeCursor(): void {}
}
