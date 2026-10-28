<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\AppFramework\Db\Entity;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

abstract class TeamScopedMapper extends QBMapper {
    public function __construct(
        IDBConnection $db,
        string $tableName,
        string $entityClass,
        protected ?ManagementAccessContext $access = null,
    ) {
        parent::__construct($db, $tableName, $entityClass);
    }

    protected function ownerExpression($qb, string $userId): mixed {
        if ($this->access === null) {
            return $qb->expr()->eq('user_id', $qb->createNamedParameter($userId));
        }
        $teamId = $this->access->activeTeamId();
        if ($teamId !== null) {
            return $qb->expr()->eq('team_id', $qb->createNamedParameter($teamId));
        }
        $actor = $this->access->legacyOwnerUserId();
        if ($actor !== $userId) {
            throw new \DomainException('The requested owner does not match the signed-in account.');
        }
        return $qb->expr()->andX(
            $qb->expr()->eq('user_id', $qb->createNamedParameter($actor)),
            $qb->expr()->isNull('team_id'),
        );
    }

    /** Child tables have no owner UID, so their Team scope is always explicit. */
    protected function applyScope($qb, ?string $alias = null): void {
        if ($this->access === null) {
            return;
        }
        $column = ($alias === null ? '' : $alias . '.') . 'team_id';
        $teamId = $this->access->activeTeamId();
        if ($teamId !== null) {
            $qb->andWhere($qb->expr()->eq($column, $qb->createNamedParameter($teamId)));
        } else {
            $this->access->legacyOwnerUserId();
            $qb->andWhere($qb->expr()->isNull($column));
        }
    }

    protected function applyCatalogueScope($qb, bool $includeSystemAccounts = false): void {
        if ($this->access === null) {
            return;
        }
        $teamId = $this->access->activeTeamId();
        if ($teamId === null) {
            $owner = $this->access->legacyOwnerUserId();
            $scopeKey = $includeSystemAccounts ? 'user:' . $owner : 'global';
        } else {
            $scopeKey = 'team:' . $teamId;
        }
        $catalogueScope = $qb->expr()->eq('scope_key', $qb->createNamedParameter($scopeKey));
        if ($includeSystemAccounts) {
            $qb->andWhere($qb->expr()->orX(
                $catalogueScope,
                $qb->expr()->andX(
                    $qb->expr()->eq('scope_key', $qb->createNamedParameter('global')),
                    $qb->expr()->eq('is_system', $qb->createNamedParameter(1, $qb::PARAM_INT)),
                ),
            ));
        } else {
            $qb->andWhere($catalogueScope);
        }
    }

    public function insert(Entity $entity): Entity {
        $this->prepareInsert($entity);
        return parent::insert($entity);
    }

    public function update(Entity $entity): Entity {
        $this->assertEntityAccess($entity);
        return parent::update($entity);
    }

    public function delete(Entity $entity): Entity {
        $this->assertEntityAccess($entity);
        return parent::delete($entity);
    }

    private function prepareInsert(Entity $entity): void {
        if ($this->access === null) {
            return;
        }
        $teamId = $this->access->activeTeamId();
        if ($teamId === null) {
            if (($entity instanceof Account || $entity instanceof TaskTemplate) && $entity->getTeamId() === null) {
                $entity->setScopeKey('user:' . $this->access->legacyOwnerUserId());
            }
            $this->assertEntityAccess($entity);
            return;
        }
        if ($entity->getTeamId() !== null && $entity->getTeamId() !== $teamId) {
            throw new \DomainException('The record belongs to another Team.');
        }
        $entity->setTeamId($teamId);
        if ($entity instanceof Account || $entity instanceof TaskTemplate) {
            $entity->setScopeKey('team:' . $teamId);
        }
    }

    private function assertEntityAccess(Entity $entity): void {
        if ($this->access === null) {
            return;
        }
        $teamId = $this->access->activeTeamId();
        if ($entity instanceof TaskTemplate) {
            $scopeKey = $teamId === null ? 'user:' . $this->access->legacyOwnerUserId() : 'team:' . $teamId;
            if ($entity->getScopeKey() !== $scopeKey) {
                throw new \DomainException('The record is not available to this owner.');
            }
        }
        if ($entity instanceof Account) {
            $scopeKey = $teamId === null ? 'user:' . $this->access->legacyOwnerUserId() : 'team:' . $teamId;
            if ((int)$entity->getIsSystem() === 1 || $entity->getScopeKey() !== $scopeKey) {
                throw new \DomainException('The account is not editable in this portfolio.');
            }
        }
        if ($teamId !== null) {
            if ($entity->getTeamId() !== $teamId) {
                throw new \DomainException('The record does not belong to the selected Team.');
            }
            return;
        }
        $owner = $this->access->legacyOwnerUserId();
        if ($entity->getTeamId() !== null || (property_exists($entity, 'userId') && $entity->getUserId() !== $owner)) {
            throw new \DomainException('The record is not available to this owner.');
        }
    }
}
