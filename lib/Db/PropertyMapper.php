<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;
use OCP\DB\Exception;

class PropertyMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_properties', Property::class);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('userId', $qb->createNamedParameter($userId)));

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Property {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('userId', $qb->createNamedParameter($userId)));

        return $this->findEntity($qb);
    }
}
