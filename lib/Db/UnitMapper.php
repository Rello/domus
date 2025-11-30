<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class UnitMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_units', Unit::class);
    }

    /** @return Unit[] */
    public function findAllByUser(string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    /** @return Unit[] */
    public function findByProperty(int $propertyId, string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    public function findByIdForUser(int $id, string $userId): ?Unit {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntity($qb);
    }

    public function countByProperty(int $propertyId, string $userId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
            ->from('domus_units')
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return (int)$qb->executeQuery()->fetchOne();
    }

    private function getBaseQuery(): IQueryBuilder {
        return $this->db->getQueryBuilder()->select('*')->from('domus_units');
    }
}
