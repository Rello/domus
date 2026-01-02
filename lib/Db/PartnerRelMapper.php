<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class PartnerRelMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_partner_rel', PartnerRel::class);
    }

    /**
     * @throws Exception
     */
    public function findForTenancy(int $tenancyId, string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('relation_id', $qb->createNamedParameter($tenancyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('type', $qb->createNamedParameter('tenancy')))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUnit(int $unitId, string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('relation_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('type', $qb->createNamedParameter('unit')))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForProperty(int $propertyId, string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('relation_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('type', $qb->createNamedParameter('property')))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntities($qb);
    }

    public function relationExists(string $type, int $relationId, int $partnerId, string $userId): bool {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*'))
            ->from($this->getTableName())
            ->where($qb->expr()->eq('type', $qb->createNamedParameter($type)))
            ->andWhere($qb->expr()->eq('relation_id', $qb->createNamedParameter($relationId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('partner_id', $qb->createNamedParameter($partnerId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return (int)$qb->executeQuery()->fetchOne() > 0;
    }

    /**
     * @throws Exception
     */
    public function deleteForRelation(string $type, int $relationId, string $userId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('type', $qb->createNamedParameter($type)))
            ->andWhere($qb->expr()->eq('relation_id', $qb->createNamedParameter($relationId, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        $qb->executeStatement();
    }
}
