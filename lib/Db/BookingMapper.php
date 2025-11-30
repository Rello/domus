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

    private function getBaseQuery(): IQueryBuilder {
        return $this->db->getQueryBuilder()->select('*')->from('domus_bookings');
    }
}
