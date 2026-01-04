<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskTemplateMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_task_templates', TaskTemplate::class);
    }

    /**
     * @throws Exception
     */
    public function findAll(?bool $activeOnly = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->orderBy('id', 'ASC');

        if ($activeOnly !== null) {
            $qb->andWhere($qb->expr()->eq('is_active', $qb->createNamedParameter($activeOnly ? 1 : 0, $qb::PARAM_INT)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByKey(string $key): ?TaskTemplate {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('key', $qb->createNamedParameter($key)))
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }
}
