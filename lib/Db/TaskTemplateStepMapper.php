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
}
