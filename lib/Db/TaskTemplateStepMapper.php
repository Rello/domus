<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskTemplateStepMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_task_tpl_steps', TaskTemplateStep::class);
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

        $result = $qb->executeQuery();
        $counts = [];
        while ($row = $result->fetchAssociative()) {
            $counts[(int)$row['template_id']] = (int)$row['step_count'];
        }
        $result->closeCursor();

        return $counts;
    }
}
