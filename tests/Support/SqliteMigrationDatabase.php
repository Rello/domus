<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Support;

/** SQL-backed implementation of the small OCP test interface, using Nextcloud's bundled DBAL. */
class SqliteMigrationDatabase implements \OCP\IDBConnection {
    public function __construct(public \Doctrine\DBAL\Connection $connection) {}
    public function beginTransaction(): void { $this->connection->beginTransaction(); }
    public function commit(): void { $this->connection->commit(); }
    public function rollBack(): void { $this->connection->rollBack(); }
    public function getQueryBuilder(): mixed { return new SqliteMigrationQuery($this->connection); }
}

class SqliteMigrationQuery {
    public const PARAM_INT = 1;
    public const PARAM_STR = 2;
    public const PARAM_NULL = 0;
    private \Doctrine\DBAL\Query\QueryBuilder $query;
    public function __construct(private \Doctrine\DBAL\Connection $db) { $this->query = $db->createQueryBuilder(); }
    public function expr(): self { return $this; }
    public function eq(string $column, string $parameter): string { return $this->query->expr()->eq($this->db->quoteIdentifier($column), $parameter); }
    public function isNull(string $column): string { return $this->query->expr()->isNull($this->db->quoteIdentifier($column)); }
    public function set(string $column, string $value): self { $this->query->set($this->db->quoteIdentifier($column), $value); return $this; }
    public function values(array $values): self {
        $quoted = [];
        foreach ($values as $column => $value) $quoted[$this->db->quoteIdentifier($column)] = $value;
        $this->query->values($quoted);
        return $this;
    }
    public function getLastInsertId(): int { return (int)$this->db->lastInsertId(); }
    public function executeQuery(): object {
        return new class($this->query->executeQuery()) {
            public function __construct(private \Doctrine\DBAL\Result $result) {}
            public function fetchAll(): array { return $this->result->fetchAllAssociative(); }
            public function closeCursor(): void { $this->result->free(); }
        };
    }
    public function __call(string $method, array $arguments): mixed {
        $result = $this->query->$method(...$arguments);
        return $result === $this->query ? $this : $result;
    }
}
