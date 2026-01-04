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
    public function findForContext(string $userId, ?int $propertyId, ?int $unitId, bool $includeDisabled = false): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        if (!$includeDisabled) {
            $qb->andWhere($qb->expr()->eq('enabled', $qb->createNamedParameter(1, $qb::PARAM_INT)));
        }

        $scopeConditions = [$qb->expr()->eq('scope', $qb->createNamedParameter('global'))];

        if ($propertyId !== null) {
            $scopeConditions[] = $qb->expr()->andX(
                $qb->expr()->eq('scope', $qb->createNamedParameter('property')),
                $qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT))
            );
        }

        if ($unitId !== null) {
            $scopeConditions[] = $qb->expr()->andX(
                $qb->expr()->eq('scope', $qb->createNamedParameter('unit')),
                $qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT))
            );
        }

        $qb->andWhere($qb->expr()->orX(...$scopeConditions))
            ->orderBy('order', 'ASC')
            ->addOrderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('order', 'ASC')
            ->addOrderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?TaskTemplate {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function getMaxOrderForUser(string $userId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('MAX(`order`)'), 'max_order')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        $row = $qb->executeQuery()->fetchAssociative();
        if (!$row || $row['max_order'] === null) {
            return 0;
        }

        return (int)$row['max_order'];
    }
}
