<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class DocumentLinkMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_docLinks', DocumentLink::class);
    }

    /**
     * @throws Exception
     */
    public function findForEntity(string $userId, string $entityType, int $entityId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
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
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findByFileId(string $userId, int $fileId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, $qb::PARAM_INT)));

        return $this->findEntities($qb);
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
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
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
}
