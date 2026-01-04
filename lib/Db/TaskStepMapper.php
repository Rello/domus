<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskStepMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_task_steps', TaskStep::class);
    }

    /**
     * @throws Exception
     */
    public function findByRun(int $runId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('workflow_run_id', $qb->createNamedParameter($runId, $qb::PARAM_INT)))
            ->orderBy('sort_order', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?TaskStep {
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
    public function findNextNewStep(int $runId, int $afterSortOrder): ?TaskStep {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('workflow_run_id', $qb->createNamedParameter($runId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('new')))
            ->andWhere($qb->expr()->gt('sort_order', $qb->createNamedParameter($afterSortOrder, $qb::PARAM_INT)))
            ->orderBy('sort_order', 'ASC')
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findOpenStepForRun(int $runId): ?TaskStep {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('workflow_run_id', $qb->createNamedParameter($runId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('open')))
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findOpenStepsByUnits(array $unitIds): array {
        if (empty($unitIds)) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('step.*', 'run.name AS run_name', 'run.status AS run_status', 'run.template_id', 'tpl.key AS template_key')
            ->from($this->getTableName(), 'step')
            ->innerJoin('step', 'domus_workflow_runs', 'run', $qb->expr()->eq('step.workflow_run_id', 'run.id'))
            ->innerJoin('step', 'domus_task_templates', 'tpl', $qb->expr()->eq('run.template_id', 'tpl.id'))
            ->where($qb->expr()->in('step.unit_id', $qb->createNamedParameter($unitIds, $qb::PARAM_INT_ARRAY)))
            ->andWhere($qb->expr()->eq('step.status', $qb->createNamedParameter('open')))
            ->orderBy('step.due_date', 'ASC');

        $rows = $qb->executeQuery()->fetchAll();
        return array_map(fn($row) => $this->hydrateEntity(TaskStep::class, $row), $rows);
    }
}
