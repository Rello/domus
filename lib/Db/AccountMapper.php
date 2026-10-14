<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class AccountMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_accounts', Account::class, $access);
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

        $this->applyCatalogueScope($qb, true);
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

        $this->applyCatalogueScope($qb, true);
        $entities = $this->findEntities($qb);

        return $entities[0] ?? null;
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?Account {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->setMaxResults(1);

        $this->applyCatalogueScope($qb, true);
        return $this->findEntity($qb);
    }

    /**
     * @throws Exception
     */
    public function findChildren(int $parentId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('parent_id', $qb->createNamedParameter($parentId, $qb::PARAM_INT)));

        $this->applyCatalogueScope($qb, true);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function getMaxSortOrder(): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('MAX(sort_order)'), 'max_sort')
            ->from($this->getTableName());

        $this->applyCatalogueScope($qb, true);
        $value = $qb->executeQuery()->fetchOne();
        return $value !== null ? (int)$value : 0;
    }
}
