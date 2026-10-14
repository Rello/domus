<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskTemplateStepMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_task_tpl_steps', TaskTemplateStep::class, $access);
    }

    /**
     * @throws Exception
     */
    public function findByTemplate(int $templateId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('template_id', $qb->createNamedParameter($templateId, $qb::PARAM_INT)))
            ->orderBy('sort_order', 'ASC');

        $this->applyScope($qb);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?TaskTemplateStep {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->setMaxResults(1);

        $this->applyScope($qb);
        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findByTemplateAndSortOrder(int $templateId, int $sortOrder): ?TaskTemplateStep {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('template_id', $qb->createNamedParameter($templateId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('sort_order', $qb->createNamedParameter($sortOrder, $qb::PARAM_INT)))
            ->setMaxResults(1);

        $this->applyScope($qb);
        $entities = $this->findEntities($qb);
        return $entities[0] ?? null;
    }

    /**
     * @throws Exception
     */
    public function countByTemplateIds(array $templateIds): array {
        if ($templateIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('template_id')
            ->selectAlias($qb->createFunction('COUNT(*)'), 'step_count')
            ->from($this->getTableName())
            ->where($qb->expr()->in('template_id', $qb->createNamedParameter($templateIds, $qb::PARAM_INT_ARRAY)))
            ->groupBy('template_id');

        $this->applyScope($qb);
        $result = $qb->executeQuery();
        $counts = [];
        while ($row = $result->fetch()) {
            $counts[(int)$row['template_id']] = (int)$row['step_count'];
        }
        $result->closeCursor();

        return $counts;
    }
}
