<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class DistributionKeyMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_dist_keys', DistributionKey::class);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?DistributionKey {
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
    public function findByProperty(int $propertyId, string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('valid_from', 'DESC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByPropertyAndType(int $propertyId, string $type, string $userId, ?int $excludeId = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('type', $qb->createNamedParameter($type)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('valid_from', 'ASC');

        if ($excludeId !== null) {
            $qb->andWhere($qb->expr()->neq('id', $qb->createNamedParameter($excludeId, $qb::PARAM_INT)));
        }

        return $this->findEntities($qb);
    }
}
