<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class ReportMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_reports', Report::class);
    }

    /** @return Report[] */
    public function findAllByUser(string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    public function findByIdForUser(int $id, string $userId): ?Report {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntity($qb);
    }

    /** @return Report[] */
    public function findByPropertyYear(int $propertyId, int $year, string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId)))
            ->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    private function getBaseQuery(): IQueryBuilder {
        return $this->db->getQueryBuilder()->select('*')->from('domus_reports');
    }
}
