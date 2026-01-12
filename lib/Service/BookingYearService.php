<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingYear;
use OCA\Domus\Db\BookingYearMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class BookingYearService {
    public function __construct(
        private BookingYearMapper $bookingYearMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private IL10N $l10n,
    ) {
    }

    public function closeYear(int $year, ?int $propertyId, ?int $unitId, string $userId): BookingYear {
        [$propertyId, $unitId] = $this->assertScope($propertyId, $unitId, $userId);

        $existing = $this->bookingYearMapper->findClosed($year, $propertyId, $unitId);
        if ($existing) {
            return $existing;
        }

        $bookingYear = new BookingYear();
        $bookingYear->setPropertyId($propertyId);
        $bookingYear->setUnitId($unitId);
        $bookingYear->setYear($year);
        $bookingYear->setClosedAt(time());

        return $this->bookingYearMapper->insert($bookingYear);
    }

    public function reopenYear(int $year, ?int $propertyId, ?int $unitId, string $userId): bool {
        [$propertyId, $unitId] = $this->assertScope($propertyId, $unitId, $userId);

        $existing = $this->bookingYearMapper->findClosed($year, $propertyId, $unitId);
        if (!$existing) {
            return false;
        }

        $this->bookingYearMapper->delete($existing);
        return true;
    }

    /**
     * @param int[] $unitIds
     */
    public function getClosedYearsForUnits(array $unitIds): array {
        $rows = $this->bookingYearMapper->findClosedYearsForUnits($unitIds);
        $closed = [];
        foreach ($rows as $row) {
            $unitId = (int)($row['unit_id'] ?? 0);
            $year = (int)($row['year'] ?? 0);
            if ($unitId === 0 || $year === 0) {
                continue;
            }
            $closed[$unitId] = $closed[$unitId] ?? [];
            $closed[$unitId][$year] = true;
        }
        return $closed;
    }

    /**
     * @param int[] $propertyIds
     */
    public function getClosedYearsForProperties(array $propertyIds): array {
        $rows = $this->bookingYearMapper->findClosedYearsForProperties($propertyIds);
        $closed = [];
        foreach ($rows as $row) {
            $propertyId = (int)($row['property_id'] ?? 0);
            $year = (int)($row['year'] ?? 0);
            if ($propertyId === 0 || $year === 0) {
                continue;
            }
            $closed[$propertyId] = $closed[$propertyId] ?? [];
            $closed[$propertyId][$year] = true;
        }
        return $closed;
    }

    public function isYearClosedForScope(int $year, ?int $propertyId, ?int $unitId): bool {
        return $this->bookingYearMapper->findClosed($year, $propertyId, $unitId) !== null;
    }

    private function assertScope(?int $propertyId, ?int $unitId, string $userId): array {
        $propertyId = $propertyId ?: null;
        $unitId = $unitId ?: null;

        if (($propertyId === null && $unitId === null) || ($propertyId !== null && $unitId !== null)) {
            throw new \InvalidArgumentException($this->l10n->t('Select exactly one scope.'));
        }

        if ($propertyId !== null) {
            if (!$this->propertyMapper->findForUser($propertyId, $userId)) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
        }

        if ($unitId !== null) {
            if (!$this->unitMapper->findForUser($unitId, $userId)) {
                throw new \RuntimeException($this->l10n->t('Unit not found.'));
            }
        }

        return [$propertyId, $unitId];
    }
}
