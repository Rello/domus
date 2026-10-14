<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TenancyMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_tenancies', Tenancy::class, $access);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?int $unitId = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId));

        if ($unitId !== null) {
            $qb->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));
        }

        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findForUser(int $id, string $userId): ?Tenancy {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($this->ownerExpression($qb, $userId));

        return $this->findEntity($qb);
    }
}
