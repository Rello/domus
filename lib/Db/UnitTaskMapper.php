<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class UnitTaskMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_unit_tasks', UnitTask::class);
    }

    /**
     * @throws Exception
     */
    public function findByUnitYear(string $userId, int $unitId, int $year): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)))
            ->orderBy('due_date', 'ASC')
            ->addOrderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?UnitTask {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }

    /**
     * @param int[] $templateIds
     *
     * @throws Exception
     */
    public function findOpenByTemplateIds(string $userId, int $unitId, int $year, array $templateIds): array {
        if ($templateIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->andWhere($qb->expr()->in('template_id', $qb->createNamedParameter($templateIds, $qb::PARAM_INT_ARRAY)))
            ->orderBy('due_date', 'ASC')
            ->addOrderBy('id', 'ASC');

        return $this->findEntities($qb);
    }
}
