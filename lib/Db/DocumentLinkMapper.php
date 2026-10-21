<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class DocumentLinkMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_docLinks', DocumentLink::class, $access);
    }

    /**
     * @throws Exception
     */
    public function findForEntity(string $userId, string $entityType, int $entityId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?DocumentLink {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($this->ownerExpression($qb, $userId));

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findByFileId(string $userId, int $fileId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, $qb::PARAM_INT)));

        return $this->findEntities($qb);
    }

    /** Return tenancy-assigned file IDs within the active ownership context. */
    public function findTenancyAssignedFileIds(string $userId, array $fileIds): array {
        if ($fileIds === []) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('file_id')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter('tenancy')))
            ->andWhere($qb->expr()->in('file_id', $qb->createNamedParameter($fileIds, $qb::PARAM_INT_ARRAY)))
            ->groupBy('file_id');

        $result = $qb->executeQuery();
        $ids = [];
        while ($row = $result->fetch()) {
            $ids[] = (int)$row['file_id'];
        }
        $result->closeCursor();
        return $ids;
    }

    /**
     * @throws Exception
     */
    public function findEntityIdsWithDocuments(string $userId, string $entityType, array $entityIds): array {
        if ($entityIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('entity_id')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->in('entity_id', $qb->createNamedParameter($entityIds, $qb::PARAM_INT_ARRAY)))
            ->groupBy('entity_id');

        $result = $qb->executeQuery();
        $ids = [];
        while ($row = $result->fetch()) {
            $ids[] = (int)$row['entity_id'];
        }
        $result->closeCursor();

        return $ids;
    }

    /**
     * @throws Exception
     */
    public function countForEntity(string $userId, string $entityType, int $entityId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)));

        return (int)$qb->executeQuery()->fetchOne();
    }

    /**
     * @throws Exception
     */
    public function countForEntities(string $userId, string $entityType, array $entityIds): int {
        if ($entityIds === []) {
            return 0;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->in('entity_id', $qb->createNamedParameter($entityIds, $qb::PARAM_INT_ARRAY)));

        return (int)$qb->executeQuery()->fetchOne();
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

    /** Remove a document's selected relations together within the active ownership context. */
    public function deleteByIds(string $userId, array $ids): void {
        if ($ids === []) {
            return;
        }
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->in('id', $qb->createNamedParameter($ids, $qb::PARAM_INT_ARRAY)));
        $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function deleteForEntities(string $userId, string $entityType, array $entityIds): void {
        if ($entityIds === []) {
            return;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($this->ownerExpression($qb, $userId))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->in('entity_id', $qb->createNamedParameter($entityIds, $qb::PARAM_INT_ARRAY)));

        $qb->executeStatement();
    }
}
