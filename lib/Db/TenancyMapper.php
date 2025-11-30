<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class TenancyMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_tenancies', Tenancy::class);
    }

    /** @return Tenancy[] */
    public function findAllByUser(string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    /** @return Tenancy[] */
    public function findByUnit(int $unitId, string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    /** @return Tenancy[] */
    public function findByPartner(int $partnerId, string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('partner_id', $qb->createNamedParameter($partnerId)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    public function findByIdForUser(int $id, string $userId): ?Tenancy {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntity($qb);
    }

    private function getBaseQuery(): IQueryBuilder {
        return $this->db->getQueryBuilder()->select('*')->from('domus_tenancies');
    }
}
