<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\IDBConnection;
use OCP\DB\Exception;

class PropertyMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_properties', Property::class, $access);
    }

    /**
     * @throws Exception
     */
    public function findByUser(string $userId, ?string $usageRole = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($this->ownerExpression($qb, $userId));

        if ($usageRole !== null && $usageRole !== '') {
            $qb->andWhere($qb->expr()->eq('usage_role', $qb->createNamedParameter($usageRole)));
        }

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
            ->andWhere($this->ownerExpression($qb, $userId));

        return $this->findEntity($qb);
    }
}
