<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\Exception;
use OCP\IDBConnection;

class AccountMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_accounts', Account::class);
    }

    /**
     * @throws Exception
     */
    public function findAllOrdered(): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->orderBy('sort_order', 'ASC')
            ->addOrderBy('number', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findByNumber(string $number): ?Account {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('number', $qb->createNamedParameter($number)))
            ->setMaxResults(1);

        $entities = $this->findEntities($qb);

        return $entities[0] ?? null;
    }
}
