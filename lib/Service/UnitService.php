<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class UnitService {
    public function __construct(
        private UnitMapper $unitMapper,
        private PropertyMapper $propertyMapper,
        private TenancyMapper $tenancyMapper,
        private PartnerRelMapper $partnerRelMapper,
        private IL10N $l10n,
    ) {
    }

    public function listUnitsForUser(string $userId, ?int $propertyId = null): array {
        $units = $this->unitMapper->findByUser($userId, $propertyId);
        foreach ($units as $unit) {
            $this->enrichWithTenancies($unit, $userId);
        }
        return $units;
    }

    public function getUnitForUser(int $id, string $userId): Unit {
        $unit = $this->unitMapper->findForUser($id, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        $this->enrichWithTenancies($unit, $userId);
        return $unit;
    }

    public function createUnit(array $data, string $userId): Unit {
        if (!isset($data['propertyId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Property reference is required.'));
        }
        $property = $this->propertyMapper->findForUser((int)$data['propertyId'], $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        $now = time();
        $unit = new Unit();
        $unit->setUserId($userId);
        $unit->setPropertyId((int)$data['propertyId']);
        $unit->setLabel($data['label'] ?? '');
        $unit->setUnitNumber($data['unitNumber'] ?? null);
        $unit->setLandRegister($data['landRegister'] ?? null);
        $unit->setLivingArea($data['livingArea'] ?? null);
        $unit->setUsableArea($data['usableArea'] ?? null);
        $unit->setUnitType($data['unitType'] ?? null);
        $unit->setNotes($data['notes'] ?? null);
        $unit->setCreatedAt($now);
        $unit->setUpdatedAt($now);

        return $this->unitMapper->insert($unit);
    }

    public function updateUnit(int $id, array $data, string $userId): Unit {
        $unit = $this->getUnitForUser($id, $userId);
        $fields = ['label', 'unitNumber', 'landRegister', 'livingArea', 'usableArea', 'unitType', 'notes'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $unit->$setter($data[$field] !== '' ? $data[$field] : null);
            }
        }
        if (isset($data['propertyId'])) {
            $property = $this->propertyMapper->findForUser((int)$data['propertyId'], $userId);
            if (!$property) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
            $unit->setPropertyId((int)$data['propertyId']);
        }
        $unit->setUpdatedAt(time());

        return $this->unitMapper->update($unit);
    }

    public function deleteUnit(int $id, string $userId): void {
        $unit = $this->getUnitForUser($id, $userId);
        $tenancies = $this->tenancyMapper->findByUser($userId, $unit->getId());
        if (count($tenancies) > 0) {
            throw new \RuntimeException($this->l10n->t('Cannot delete unit with existing tenancies.'));
        }
        $this->partnerRelMapper->deleteForRelation('unit', $unit->getId(), $userId);
        $this->unitMapper->delete($unit);
    }

    private function enrichWithTenancies(Unit $unit, string $userId): void {
        $tenancies = $this->tenancyMapper->findByUser($userId, $unit->getId());
        $active = [];
        $historic = [];
        $today = new \DateTimeImmutable('today');
        foreach ($tenancies as $tenancy) {
            $status = $this->resolveStatus($tenancy, $today);
            $tenancy->setStatus($status);
            if ($status === 'historical') {
                $historic[] = $tenancy;
            } elseif ($status === 'active') {
                $active[] = $tenancy;
            }
        }
        $unit->setActiveTenancies($active);
        $unit->setHistoricTenancies($historic);
    }

    private function resolveStatus($tenancy, \DateTimeImmutable $today): string {
        $start = new \DateTimeImmutable($tenancy->getStartDate());
        $end = $tenancy->getEndDate() ? new \DateTimeImmutable($tenancy->getEndDate()) : null;
        if ($start > $today) {
            return 'future';
        }
        if ($end !== null && $end < $today) {
            return 'historical';
        }
        return 'active';
    }
}
