<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_tasks', Task::class);
    }

    /**
     * @throws Exception
     */
    public function findByEntity(string $entityType, int $entityId, ?string $status = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId, $qb::PARAM_INT)))
            ->orderBy('created_at', 'DESC');

        if ($status !== null) {
            $qb->andWhere($qb->expr()->eq('status', $qb->createNamedParameter($status)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?Task {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->setMaxResults(1);

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
        $qb->select('*')
            ->from($this->getTableName())
            ->where(call_user_func_array([$qb->expr(), 'orX'], $conditions))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->orderBy('due_date', 'ASC');

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

        $qb->executeStatement();
    }
}
