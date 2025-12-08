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
            'account' => 'account',
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

    /**
     * @throws Exception
     */
    public function sumByAccount(string $userId, int $year, ?int $propertyId = null, ?int $unitId = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('account')
            ->selectAlias($qb->createFunction('SUM(amount)'), 'total')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)));

        if ($propertyId !== null) {
            $qb->andWhere($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        }

        if ($unitId !== null) {
            $qb->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));
        }

        return $qb->executeQuery()->fetchAll();
    }

    /**
     * @throws Exception
     */
    public function sumByAccountGrouped(string $userId, ?int $year, string $groupBy, ?int $groupId = null): array {
        $groupColumn = $groupBy === 'unit' ? 'unit_id' : 'property_id';
        $qb = $this->db->getQueryBuilder();
        $qb->select('year')
            ->addSelect($groupColumn)
            ->addSelect('account')
            ->selectAlias($qb->createFunction('SUM(amount)'), 'total')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->groupBy('year')
            ->addGroupBy($groupColumn)
            ->addGroupBy('account')
            ->orderBy('year', 'DESC');

        if ($year !== null) {
            $qb->andWhere($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)));
        }

        if ($groupId !== null) {
            $qb->andWhere($qb->expr()->eq($groupColumn, $qb->createNamedParameter($groupId, $qb::PARAM_INT)));
        }

        return $qb->executeQuery()->fetchAll();
    }
}
