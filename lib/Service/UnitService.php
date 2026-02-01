<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\BookingYearMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\TaskStepMapper;
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
        private TaskMapper $taskMapper,
        private TaskStepMapper $taskStepMapper,
        private BookingMapper $bookingMapper,
        private BookingYearMapper $bookingYearMapper,
        private DocumentLinkMapper $documentLinkMapper,
        private PartnerRelMapper $partnerRelMapper,
        private TenancyService $tenancyService,
        private PermissionService $permissionService,
        private DocumentPathService $documentPathService,
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
        $propertyName = null;
        $this->permissionService->assertPropertyRequirement($role, $propertyId ? (int)$propertyId : null);
        if ($propertyId !== null) {
            $property = $this->propertyMapper->findForUser((int)$propertyId, $userId);
            if (!$property) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
            $propertyName = $property->getName();
        }
        $now = time();
        $unit = new Unit();
        $unit->setUserId($userId);
        $unit->setPropertyId($propertyId !== null ? (int)$propertyId : null);
        $unit->setLabel($data['label'] ?? '');
        $unit->setUnitNumber($data['unitNumber'] ?? null);
        $unit->setLandRegister($data['landRegister'] ?? null);
        $unit->setLivingArea($data['livingArea'] ?? null);
        $unit->setUnitType($data['unitType'] ?? null);
        $unit->setBuyDate($data['buyDate'] ?? null);
        $unit->setTotalCosts($data['totalCosts'] ?? null);
        $unit->setTaxId($data['taxId'] ?? null);
        $unit->setIban($data['iban'] ?? null);
        $unit->setBic($data['bic'] ?? null);
        $unit->setNotes($data['notes'] ?? null);
        $unit->setDocumentPath($this->documentPathService->buildUnitPath($unit->getLabel(), $unit->getUnitNumber(), $propertyName));
        $unit->setCreatedAt($now);
        $unit->setUpdatedAt($now);

        return $this->unitMapper->insert($unit);
    }

    public function updateUnit(int $id, array $data, string $userId, string $role): Unit {
        $unit = $this->getUnitForUser($id, $userId);
        if ($this->permissionService->isBuildingManagement($role) && $unit->getPropertyId() === null && !isset($data['propertyId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Property is required for building management.'));
        }
        if (array_key_exists('documentPath', $data)) {
            $documentPath = trim((string)$data['documentPath']);
            if ($documentPath === '') {
                throw new \InvalidArgumentException($this->l10n->t('Document location is required.'));
            }
            $unit->setDocumentPath($documentPath);
        }
        $fields = ['label', 'unitNumber', 'landRegister', 'livingArea', 'unitType', 'buyDate', 'totalCosts', 'taxId', 'iban', 'bic', 'notes'];
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
        $bookings = $this->bookingMapper->findByUser($userId, ['unitId' => $unit->getId()]);
        $tenancyIds = array_map(fn($tenancy) => $tenancy->getId(), $tenancies);
        $bookingIds = array_map(fn($booking) => $booking->getId(), $bookings);

        $this->documentLinkMapper->deleteForEntity($userId, 'unit', $unit->getId());
        $this->documentLinkMapper->deleteForEntities($userId, 'tenancy', $tenancyIds);
        $this->documentLinkMapper->deleteForEntities($userId, 'booking', $bookingIds);
        $this->bookingMapper->deleteByUnit($userId, $unit->getId());
        foreach ($tenancies as $tenancy) {
            $this->tenancyService->deleteTenancy($tenancy->getId(), $userId);
        }
        $this->taskMapper->deleteByUnit($unit->getId());
        $this->bookingYearMapper->deleteByUnit($unit->getId());
        $this->partnerRelMapper->deleteForRelation('unit', $unit->getId(), $userId);
        $this->unitMapper->delete($unit);
    }

    public function getDeletionSummary(int $id, string $userId): array {
        $unit = $this->getUnitForUser($id, $userId);
        $tenancies = $this->tenancyMapper->findByUser($userId, $unit->getId());
        $bookings = $this->bookingMapper->findByUser($userId, ['unitId' => $unit->getId()]);
        $tenancyIds = array_map(fn($tenancy) => $tenancy->getId(), $tenancies);
        $bookingIds = array_map(fn($booking) => $booking->getId(), $bookings);
        $documentLinks = $this->documentLinkMapper->countForEntity($userId, 'unit', $unit->getId())
            + $this->documentLinkMapper->countForEntities($userId, 'tenancy', $tenancyIds)
            + $this->documentLinkMapper->countForEntities($userId, 'booking', $bookingIds);

        return [
            'tasks' => $this->taskMapper->countByUnit($unit->getId()),
            'taskSteps' => $this->taskStepMapper->countByUnit($unit->getId()),
            'tenancies' => count($tenancies),
            'bookings' => count($bookings),
            'documentLinks' => $documentLinks,
            'yearStatus' => $this->bookingYearMapper->countByUnit($unit->getId()),
        ];
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
