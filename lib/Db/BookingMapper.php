<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class BookingMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_bookings', Booking::class);
    }

    /** @return Booking[] */
    public function findAllByUser(string $userId): array {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    public function findByIdForUser(int $id, string $userId): ?Booking {
        $qb = $this->getBaseQuery();
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntity($qb);
    }

    public function sumAmountByYear(string $userId, int $year): float {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->createFunction('COALESCE(SUM(amount), 0)'))
            ->from('domus_bookings')
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq($qb->createFunction('YEAR(`date`)'), $qb->createNamedParameter($year)));
        return (float)$qb->executeQuery()->fetchOne();
    }

    private function getBaseQuery(): IQueryBuilder {
        return $this->db->getQueryBuilder()->select('*')->from('domus_bookings');
    }
}
