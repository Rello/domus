<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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

		$steps = $this->findEntities($qb);
		return $steps[0] ?? null;
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
    public function findOpenStepsByEntities(array $entities): array {
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
                $qb->expr()->eq('step.entity_type', $qb->createNamedParameter($type)),
                $qb->expr()->eq('step.entity_id', $qb->createNamedParameter($id, $qb::PARAM_INT))
            );
        }
        if ($conditions === []) {
            return [];
        }

        $qb->select('step.*', 'run.name AS run_name', 'run.status AS run_status', 'run.template_id', 'tpl.key AS template_key')
            ->from($this->getTableName(), 'step')
            ->innerJoin('step', 'domus_workflow_runs', 'run', $qb->expr()->eq('step.workflow_run_id', 'run.id'))
            ->innerJoin('step', 'domus_task_templates', 'tpl', $qb->expr()->eq('run.template_id', 'tpl.id'))
            ->where(call_user_func_array([$qb->expr(), 'orX'], $conditions))
            ->andWhere($qb->expr()->eq('step.status', $qb->createNamedParameter('open')))
            ->orderBy('step.due_date', 'ASC');

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
}
