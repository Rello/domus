<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;
use OCP\AppFramework\Db\Entity;

class TaskTemplateStepMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null, private ?TaskTemplateMapper $templates = null) {
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

        $this->applyTemplateScope($qb);
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

        $this->applyTemplateScope($qb);
        return $this->findEntities($qb)[0] ?? null;
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

        $this->applyTemplateScope($qb);
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

        $this->applyTemplateScope($qb);
        $result = $qb->executeQuery();
        $counts = [];
        while ($row = $result->fetch()) {
            $counts[(int)$row['template_id']] = (int)$row['step_count'];
        }
        $result->closeCursor();

        return $counts;
    }
    public function findForRun(WorkflowRun $run): array {
        $mapper = $this->templates ?? new TaskTemplateMapper($this->db, $this->access);
        if (!$mapper->findForRun($run)) return [];
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('template_id', $qb->createNamedParameter($run->getTemplateId())))
            ->orderBy('sort_order', 'ASC');
        return $this->findEntities($qb);
    }

    private function applyTemplateScope($qb): void {
        if ($this->access === null) return;
        $templates = ($this->templates ?? new TaskTemplateMapper($this->db, $this->access))->findAll();
        $ids = array_map(fn($template) => (int)$template->getId(), $templates);
        $qb->andWhere($qb->expr()->in('template_id', $qb->createNamedParameter($ids ?: [-1], $qb::PARAM_INT_ARRAY)));
    }

    private function assertTemplateWritable(Entity $step): void {
        if ($this->access === null) return;
        $mapper = $this->templates ?? new TaskTemplateMapper($this->db, $this->access);
        $template = $mapper->findById((int)$step->getTemplateId());
        if (!$template || $template->getScopeKey() !== $mapper->currentScopeKey()) {
            throw new \DomainException('The record is not available to this owner.');
        }
    }

    public function insert(Entity $entity): Entity {
        $this->assertTemplateWritable($entity);
        return parent::insert($entity);
    }

    public function update(Entity $entity): Entity {
        $this->assertTemplateWritable($entity);
        return parent::update($entity);
    }

    public function delete(Entity $entity): Entity {
        $this->assertTemplateWritable($entity);
        return parent::delete($entity);
    }
}
