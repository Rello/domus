<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class WorkflowRunMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_workflow_runs', WorkflowRun::class);
    }

    /**
     * @throws Exception
     */
    public function findByUnit(int $unitId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->orderBy('started_at', 'DESC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?WorkflowRun {
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
    public function findOpenRunForYear(int $unitId, int $templateId, int $year): ?WorkflowRun {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('template_id', $qb->createNamedParameter($templateId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }
}
