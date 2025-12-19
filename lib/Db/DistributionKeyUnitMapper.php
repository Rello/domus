<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class DistributionKeyUnitMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_dist_key_units', DistributionKeyUnit::class);
    }

    /**
     * @throws Exception
     */
    public function findValidForKey(int $distributionKeyId, string $userId, string $periodFrom, string $periodTo): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('distribution_key_id', $qb->createNamedParameter($distributionKeyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->lte('valid_from', $qb->createNamedParameter($periodTo)))
            ->andWhere($qb->expr()->orX(
                $qb->expr()->isNull('valid_to'),
                $qb->expr()->gte('valid_to', $qb->createNamedParameter($periodFrom))
            ))
            ->orderBy('valid_from', 'DESC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findLatestForUnitAndKey(int $unitId, int $distributionKeyId, string $userId): ?DistributionKeyUnit {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('distribution_key_id', $qb->createNamedParameter($distributionKeyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('valid_from', 'DESC')
            ->setMaxResults(1);

        $entities = $this->findEntities($qb);
        return $entities[0] ?? null;
    }
}
