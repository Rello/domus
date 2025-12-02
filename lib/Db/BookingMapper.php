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
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        // Map external filter keys (camelCase) to database column names (snake_case)
        $fields = [
            'year' => 'year',
            'propertyId' => 'property_id',
            'unitId' => 'unit_id',
            'tenancyId' => 'tenancy_id',
            'category' => 'category',
            'bookingType' => 'booking_type',
        ];
        foreach ($fields as $key => $column) {
            if (isset($filter[$key])) {
                $qb->andWhere($qb->expr()->eq($column, $qb->createNamedParameter($filter[$key])));
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
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
