<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class ReportMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_reports', Report::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?int $propertyId = null, ?int $year = null, ?int $tenancyId = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        if ($propertyId !== null) {
            $qb->andWhere($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        }
        if ($year !== null) {
            $qb->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)));
        }
        if ($tenancyId !== null) {
            $qb->andWhere($qb->expr()->eq('tenancy_id', $qb->createNamedParameter($tenancyId, $qb::PARAM_INT)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Report {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
