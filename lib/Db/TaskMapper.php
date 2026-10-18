<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskMapper extends TeamScopedMapper {
    private const SELECT_COLUMNS = [
        'id',
        'deferred_until',
        'rule_id',
        'rule_tenancy_id',
        'team_id',
        'entity_type',
        'entity_id',
        'title',
        'description',
        'status',
        'due_date',
        'closed_at',
        'closed_by',
        'created_by',
        'created_at',
        'updated_at',
    ];

    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_tasks', Task::class, $access);
    }

    private function applyTaskSelect($qb): void {
        $qb->select(...self::SELECT_COLUMNS);
    }

    /**
     * @throws Exception
     */
    public function findByEntity(string $entityType, int $entityId, ?string $status = null): array {
        $qb = $this->db->getQueryBuilder();
        $this->applyTaskSelect($qb);
        $qb->from($this->getTableName())
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)))
            ->orderBy('created_at', 'DESC');

        if ($status !== null) {
            $qb->andWhere($qb->expr()->eq('status', $qb->createNamedParameter($status)));
        }

        $this->applyScope($qb);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?Task {
        $qb = $this->db->getQueryBuilder();
        $this->applyTaskSelect($qb);
        $qb->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->setMaxResults(1);

        $this->applyScope($qb);
        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findOpenTasks(array $entities): array {
        if ($entities === []) {
            return [];
        }

        $conditions = [];
        $qb = $this->db->getQueryBuilder();
        foreach ($entities as $entity) {
            $type = (string)($entity['entityType'] ?? '');
            $id = isset($entity['entityId']) ? (int)$entity['entityId'] : 0;
            if ($type === '' || $id <= 0) {
                continue;
            }
            $conditions[] = $qb->expr()->andX(
                $qb->expr()->eq('entity_type', $qb->createNamedParameter($type)),
                $qb->expr()->eq('entity_id', $qb->createNamedParameter($id, $qb::PARAM_INT))
            );
        }
        if ($conditions === []) {
            return [];
        }
        $this->applyTaskSelect($qb);
        $qb->from($this->getTableName())
            ->where(call_user_func_array([$qb->expr(), 'orX'], $conditions))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->orderBy('due_date', 'ASC');

        $this->applyScope($qb);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function countByEntity(string $entityType, int $entityId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $this->applyScope($qb);
        return (int)$qb->executeQuery()->fetchOne();
    }

    /**
     * @throws Exception
     */
    public function deleteByEntity(string $entityType, int $entityId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $this->applyScope($qb);
        $qb->executeStatement();
    }
}
