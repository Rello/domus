<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Service\TenancyService;
use OCP\IL10N;

class UnitService {
    public function __construct(
        private UnitMapper $unitMapper,
        private PropertyMapper $propertyMapper,
        private TenancyMapper $tenancyMapper,
        private PartnerRelMapper $partnerRelMapper,
        private TenancyService $tenancyService,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
    }

    public function listUnitsForUser(string $userId, ?int $propertyId = null, string $role = 'landlord'): array {
        $isBuildingManagement = $this->permissionService->isBuildingManagement($role);
        $propertyFilter = $isBuildingManagement ? $propertyId : null;
        $units = $this->unitMapper->findByUser($userId, $propertyFilter, !$isBuildingManagement);
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

    public function createUnit(array $data, string $userId, string $role): Unit {
        $propertyId = $data['propertyId'] ?? null;
        $this->permissionService->assertPropertyRequirement($role, $propertyId ? (int)$propertyId : null);
        if ($propertyId !== null) {
            $property = $this->propertyMapper->findForUser((int)$propertyId, $userId);
            if (!$property) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
        }
        $now = time();
        $unit = new Unit();
        $unit->setUserId($userId);
        $unit->setPropertyId($propertyId !== null ? (int)$propertyId : null);
        $unit->setLabel($data['label'] ?? '');
        $unit->setUnitNumber($data['unitNumber'] ?? null);
        $unit->setLandRegister($data['landRegister'] ?? null);
        $unit->setLivingArea($data['livingArea'] ?? null);
        $unit->setUsableArea($data['usableArea'] ?? null);
        $unit->setUnitType($data['unitType'] ?? null);
        $unit->setBuyDate($data['buyDate'] ?? null);
        $unit->setTotalCosts($data['totalCosts'] ?? null);
        $unit->setOfficialId($data['officialId'] ?? null);
        $unit->setIban($data['iban'] ?? null);
        $unit->setBic($data['bic'] ?? null);
        $unit->setNotes($data['notes'] ?? null);
        $unit->setCreatedAt($now);
        $unit->setUpdatedAt($now);

        return $this->unitMapper->insert($unit);
    }

    public function updateUnit(int $id, array $data, string $userId, string $role): Unit {
        $unit = $this->getUnitForUser($id, $userId);
        if ($this->permissionService->isBuildingManagement($role) && $unit->getPropertyId() === null && !isset($data['propertyId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Property is required for building management.'));
        }
        $fields = ['label', 'unitNumber', 'landRegister', 'livingArea', 'usableArea', 'unitType', 'buyDate', 'totalCosts', 'officialId', 'iban', 'bic', 'notes'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $unit->$setter($data[$field] !== '' ? $data[$field] : null);
            }
        }
        if (isset($data['propertyId'])) {
            $this->permissionService->assertPropertyRequirement($role, (int)$data['propertyId']);
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
        $tenancies = $this->tenancyService->listTenancies($userId, $unit->getId());
        $active = [];
        $historic = [];
        $today = new \DateTimeImmutable('today');
        foreach ($tenancies as $tenancy) {
            $status = $tenancy->getStatus() ?? $this->tenancyService->getStatus($tenancy, $today);
            if ($status === 'historical') {
                $historic[] = $tenancy;
            } else {
                $active[] = $tenancy;
            }
        }
        $unit->setActiveTenancies($active);
        $unit->setHistoricTenancies($historic);
    }
}
