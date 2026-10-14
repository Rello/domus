<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP\AppFramework\Db;

use OCP\IDBConnection;

abstract class QBMapper {
    protected IDBConnection $db;

    public function __construct(IDBConnection $db, private string $tableName, private string $entityClass) {
        $this->db = $db;
    }

    protected function getTableName(): string {
        return $this->tableName;
    }

    protected function getEntityClass(): string {
        return $this->entityClass;
    }

    protected function findEntities(mixed $query): array {
        return [];
    }

    protected function findEntity(mixed $query): mixed {
        $entities = $this->findEntities($query);
        return $entities[0] ?? null;
    }

    public function insert(Entity $entity): Entity {
        return $entity;
    }

    public function update(Entity $entity): Entity {
        return $entity;
    }

    public function delete(Entity $entity): Entity {
        return $entity;
    }
}
