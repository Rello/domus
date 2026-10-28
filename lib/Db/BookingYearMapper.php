<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\DB\Exception;
use OCP\IDBConnection;

class BookingYearMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_booking_years', BookingYear::class, $access);
    }

    /** Serialize year transitions on the parent row, including on SQLite.
     * The UPDATE must precede closure reads so concurrent callers cannot both
     * observe an absent closure. Reopening uses the same lock.
     */
    public function withScopeLock(?int $propertyId, ?int $unitId, string $userId, callable $operation): mixed {
        $this->db->beginTransaction();
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->update($propertyId !== null ? 'domus_properties' : 'domus_units')
                ->set('id', $qb->createNamedParameter($propertyId ?? $unitId, $qb::PARAM_INT))
                ->where($qb->expr()->eq('id', $qb->createNamedParameter($propertyId ?? $unitId, $qb::PARAM_INT)))
                ->andWhere($this->ownerExpression($qb, $userId));
            $qb->executeStatement();
            $result = $operation();
            $this->db->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /** Remove every matching closure, including duplicates from older versions. */
    public function deleteClosed(int $year, ?int $propertyId, ?int $unitId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)));
        foreach (['property_id' => $propertyId, 'unit_id' => $unitId] as $column => $id) {
            $qb->andWhere($id === null ? $qb->expr()->isNull($column)
                : $qb->expr()->eq($column, $qb->createNamedParameter($id, $qb::PARAM_INT)));
        }
        $this->applyScope($qb);
        return $qb->executeStatement();
    }

    /**
     * @throws Exception
     */
    public function findClosed(int $year, ?int $propertyId, ?int $unitId): ?BookingYear {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('year', $qb->createNamedParameter($year, $qb::PARAM_INT)));

        if ($propertyId !== null) {
            $qb->andWhere($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        } else {
            $qb->andWhere($qb->expr()->isNull('property_id'));
        }

        if ($unitId !== null) {
            $qb->andWhere($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));
        } else {
            $qb->andWhere($qb->expr()->isNull('unit_id'));
        }

        $this->applyScope($qb);
        $results = $this->findEntities($qb);
        return $results[0] ?? null;
    }

    /**
     * @param int[] $unitIds
     *
     * @throws Exception
     */
    public function findClosedYearsForUnits(array $unitIds): array {
        if ($unitIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('unit_id', 'year')
            ->from($this->getTableName())
            ->where($qb->expr()->in('unit_id', $qb->createNamedParameter($unitIds, $qb::PARAM_INT_ARRAY)));

        $this->applyScope($qb);
        return $qb->executeQuery()->fetchAll();
    }

    /**
     * @param int[] $propertyIds
     *
     * @throws Exception
     */
    public function findClosedYearsForProperties(array $propertyIds): array {
        if ($propertyIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('property_id', 'year')
            ->from($this->getTableName())
            ->where($qb->expr()->in('property_id', $qb->createNamedParameter($propertyIds, $qb::PARAM_INT_ARRAY)));

        $this->applyScope($qb);
        return $qb->executeQuery()->fetchAll();
    }

    /**
     * @throws Exception
     */
    public function findByUnit(int $unitId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));

        $this->applyScope($qb);
        return $this->findEntities($qb);
    }

    /**
     * @throws Exception
     */
    public function countByUnit(int $unitId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));

        $this->applyScope($qb);
        return (int)$qb->executeQuery()->fetchOne();
    }

    /**
     * @throws Exception
     */
    public function deleteByUnit(int $unitId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('unit_id', $qb->createNamedParameter($unitId, $qb::PARAM_INT)));

        $this->applyScope($qb);
        $qb->executeStatement();
    }
    /** @throws Exception */
    public function countByProperty(int $propertyId): int {
        $qb = $this->db->getQueryBuilder();
        $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        $this->applyScope($qb);
        return (int)$qb->executeQuery()->fetchOne();
    }

    /** @throws Exception */
    public function deleteByProperty(int $propertyId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('property_id', $qb->createNamedParameter($propertyId, $qb::PARAM_INT)));
        $this->applyScope($qb);
        $qb->executeStatement();
    }

}
