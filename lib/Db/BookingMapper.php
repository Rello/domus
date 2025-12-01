<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class BookingMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_bookings', Booking::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, array $filter = []): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('userId', $qb->createNamedParameter($userId)));

        foreach (['year', 'propertyId', 'unitId', 'tenancyId', 'category', 'bookingType'] as $field) {
            if (isset($filter[$field])) {
                $qb->andWhere($qb->expr()->eq($field, $qb->createNamedParameter($filter[$field])));
            }
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Booking {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('userId', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
