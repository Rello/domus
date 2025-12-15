<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class UnitMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_units', Unit::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?int $propertyId = null, bool $onlyWithoutProperty = false): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        if ($propertyId !== null) {
            $qb->andWhere($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        } elseif ($onlyWithoutProperty) {
            $qb->andWhere($qb->expr()->isNull('property_id'));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Unit {
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
    public function countByProperty(int $propertyId, string $userId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*'))
            ->from($this->getTableName())
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return (int)$qb->executeQuery()->fetchOne();
    }
}
