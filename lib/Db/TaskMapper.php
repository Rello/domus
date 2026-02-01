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
    public function findByUnit(int $unitId, ?string $status = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
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
    public function findOpenTasks(array $unitIds): array {
        if (empty($unitIds)) {
            return [];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->in('unit_id', $qb->createNamedParameter($unitIds, $qb::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->orderBy('due_date', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function countByUnit(int $unitId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));

        return (int)$qb->executeQuery()->fetchOne();
    }

    /**
     * @throws Exception
     */
    public function deleteByUnit(int $unitId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));

        $qb->executeStatement();
    }
}
