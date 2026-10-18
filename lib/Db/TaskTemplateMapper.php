<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class TaskTemplateMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_task_templates', TaskTemplate::class, $access);
    }

    private function selectColumns(): array {
        return [
            'id',
            'team_id',
            'scope_key',
            'key',
            'name',
            'description',
            'applies_to',
            'is_active',
            'created_at',
            'updated_at',
        ];
    }

    /**
     * @throws Exception
     */
    public function findAll(?bool $activeOnly = null, ?string $appliesTo = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select(...$this->selectColumns())
            ->from($this->getTableName())
            ->orderBy('id', 'ASC');

        if ($activeOnly !== null) {
            $qb->andWhere($qb->expr()->eq('is_active', $qb->createNamedParameter($activeOnly ? 1 : 0, $qb::PARAM_INT)));
        }
        if ($appliesTo !== null && $appliesTo !== '') {
            $qb->andWhere($qb->expr()->eq('applies_to', $qb->createNamedParameter($appliesTo)));
        }

        $this->applyCatalogueScope($qb, false);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function findById(int $id): ?TaskTemplate {
        $qb = $this->db->getQueryBuilder();
        $qb->select(...$this->selectColumns())
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->setMaxResults(1);

        $this->applyCatalogueScope($qb, false);
        $templates = $this->findEntities($qb);
        return $templates[0] ?? null;
    }

    /**
     * @throws Exception
     */
    public function findByKey(string $key): ?TaskTemplate {
        $qb = $this->db->getQueryBuilder();
        $qb->select(...$this->selectColumns())
            ->from($this->getTableName())
            ->where($qb->expr()->eq('key', $qb->createNamedParameter($key)))
            ->setMaxResults(1);

        $this->applyCatalogueScope($qb, false);
        $templates = $this->findEntities($qb);
        return $templates[0] ?? null;
    }
}
