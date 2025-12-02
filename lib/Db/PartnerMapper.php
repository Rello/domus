<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class PartnerMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_partners', Partner::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?string $type = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        if ($type !== null) {
            $qb->andWhere($qb->expr()->eq('partner_type', $qb->createNamedParameter($type)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Partner {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
