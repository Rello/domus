<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class ActionLogMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_action_logs', ActionLog::class, $access);
    }

    /**
     * @throws Exception
     */
    public function findByEntity(string $userId, string $entityType, int $entityId, ?int $limit = null, int $offset = 0): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)))
            ->orderBy('created_at', 'DESC')
            ->addOrderBy('id', 'DESC');

        if ($limit !== null) {
            $qb->setMaxResults($limit);
            if ($offset > 0) {
                $qb->setFirstResult($offset);
            }
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByEntities(string $userId, array $entities, ?int $limit = null, int $offset = 0): array {
        if ($entities === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $conditions = [];

        foreach ($entities as $entity) {
            $entityType = (string)($entity['entityType'] ?? '');
            $entityId = isset($entity['entityId']) ? (int)$entity['entityId'] : 0;
            if ($entityType === '' || $entityId <= 0) {
                continue;
            }

            $conditions[] = $qb->expr()->andX(
                $qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)),
                $qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT))
            );
        }

        if ($conditions === []) {
            return [];
        }

        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere(call_user_func_array([$qb->expr(), 'orX'], $conditions))
            ->orderBy('created_at', 'DESC')
            ->addOrderBy('id', 'DESC');

        if ($limit !== null) {
            $qb->setMaxResults($limit);
            if ($offset > 0) {
                $qb->setFirstResult($offset);
            }
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?ActionLog {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($this->ownerExpression($qb, $userId))
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function deleteForEntity(string $userId, string $entityType, int $entityId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function deleteForLinkedEntity(string $userId, string $entityType, int $entityId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('linked_entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('linked_entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function countAffectedByEntity(string $userId, string $entityType, int $entityId): int {
        return $this->countAffectedByEntities($userId, [['entityType' => $entityType, 'entityId' => $entityId]]);
    }

    /** Count each action once, even if both ends belong to the deletion. */
    public function countAffectedByEntities(string $userId, array $entities): int {
        if ($entities === []) {
            return 0;
        }
        $qb = $this->db->getQueryBuilder();
        $conditions = [];
        foreach ($entities as $entity) {
            foreach (['entity', 'linked_entity'] as $prefix) {
                $conditions[] = $qb->expr()->andX(
                    $qb->expr()->eq($prefix . '_type', $qb->createNamedParameter($entity['entityType'])),
                    $qb->expr()->eq($prefix . '_id', $qb->createNamedParameter($entity['entityId'], $qb::PARAM_INT))
                );
            }
        }
        $qb->selectAlias($qb->createFunction('COUNT(DISTINCT id)'), 'amount')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->orX(...$conditions));

        return (int)$qb->executeQuery()->fetchOne();
    }
}
