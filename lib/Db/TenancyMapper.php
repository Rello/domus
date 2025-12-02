<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TenancyMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_tenancies', Tenancy::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?int $unitId = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        if ($unitId !== null) {
            $qb->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Tenancy {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
