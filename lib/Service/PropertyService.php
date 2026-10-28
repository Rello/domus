<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Exception\ResourceNotFoundException;
use OCA\Domus\Db\ActionLogMapper;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\BookingYearMapper;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\TaskStepMapper;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\WorkflowRunMapper;
use OCP\IL10N;
use OCP\IDBConnection;

class PropertyService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private BookingMapper $bookingMapper,
        private DocumentLinkMapper $documentLinkMapper,
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private PartnerRelMapper $partnerRelMapper,
        private ActionLogMapper $actionLogMapper,
        private TaskMapper $taskMapper,
        private TaskStepMapper $taskStepMapper,
        private WorkflowRunMapper $workflowRunMapper,
        private TenancyService $tenancyService,
        private DocumentPathService $documentPathService,
        private UnitService $unitService,
        private PermissionService $permissionService,
        private EntityImageService $entityImageService,
        private IL10N $l10n,
        private BookingYearMapper $bookingYearMapper,
        private IDBConnection $connection,
        private ?AuditService $audit = null,
    ) {
    }

    public function listPropertiesForUser(string $userId, string $role = 'landlord'): array {
        $usageRoleFilter = $this->resolveUsageRoleFilter($role);
        if ($usageRoleFilter === false) {
            return [];
        }

        $properties = $this->propertyMapper->findByUser($userId, $usageRoleFilter);
        $unitsByProperty = [];
        foreach ($this->unitMapper->findByUser($userId) as $unit) {
            $unitsByProperty[$unit->getPropertyId()][] = $unit;
        }
        $tenanciesByUnit = $properties === [] ? [] : $this->tenancyService->listTenanciesByUnit($userId);
        $bookingsByProperty = [];
        foreach ($properties === [] ? [] : $this->loadBookings($userId) as $booking) {
            $bookingsByProperty[$booking->getPropertyId()][] = $booking;
        }
        foreach ($properties as $property) {
            $this->enrichProperty($property, $unitsByProperty[$property->getId()] ?? [], $tenanciesByUnit, $bookingsByProperty[$property->getId()] ?? []);
        }
        return $properties;
    }

    public function getPropertyForUser(int $id, string $userId): Property {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            throw new ResourceNotFoundException($this->l10n->t('Property not found.'));
        }
        $this->enrichProperty($property);
        return $property;
    }

    public function createProperty(array $data, string $userId): Property {
        if (!isset($data['name']) || trim((string)$data['name']) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Property name cannot be empty.'));
        }
        if (!in_array($data['usageRole'] ?? '', ['manager', 'landlord'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
        }
        $now = time();
        $property = new Property();
        $property->setUserId($userId);
        $property->setUsageRole($data['usageRole']);
        $property->setName($data['name']);
        $property->setStreet($data['street'] ?? null);
        $property->setZip($data['zip'] ?? null);
        $property->setCity($data['city'] ?? null);
        $property->setCountry($data['country'] ?? null);
        $property->setType($data['type'] ?? null);
        $property->setDescription($data['description'] ?? null);
        $property->setDocumentPath($this->documentPathService->buildPropertyPath($property->getName()));
        $property->setCreatedAt($now);
        $property->setUpdatedAt($now);

        return $this->propertyMapper->insert($property);
    }

    public function updateProperty(int $id, array $data, string $userId): Property {
        $property = $this->getPropertyForUser($id, $userId);
        if (isset($data['name']) && trim((string)$data['name']) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Property name cannot be empty.'));
        }
        if (array_key_exists('documentPath', $data)) {
            $documentPath = trim((string)$data['documentPath']);
            if ($documentPath === '') {
                throw new \InvalidArgumentException($this->l10n->t('Document location is required.'));
            }
            $property->setDocumentPath($documentPath);
        }
        $fields = ['name', 'street', 'zip', 'city', 'country', 'type', 'description'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $property->$setter($data[$field] ?: null);
            }
        }
        if (isset($data['usageRole'])) {
            if (!in_array($data['usageRole'], ['manager', 'landlord'], true)) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
            }
            $property->setUsageRole($data['usageRole']);
        }
        $property->setUpdatedAt(time());

        return $this->propertyMapper->update($property);
    }

    public function deleteProperty(int $id, string $userId): void {
        $this->connection->beginTransaction();
        try {
            $property = $this->getPropertyForUser($id, $userId);
            $counts = $this->audit !== null ? $this->getDeletionSummary($id, $userId) : [];
            $units = $this->unitMapper->findByUser($userId, $property->getId());
            $distributionKeys = $this->distributionKeyMapper->findByProperty($property->getId(), $userId);
            $distributionKeyIds = array_values(array_filter(array_map(fn($key) => $key->getId(), $distributionKeys)));

            $bookings = $this->bookingMapper->findByUser($userId, ['propertyId' => $id]);
            foreach ($units as $unit) {
                $this->unitService->deleteUnit($unit->getId(), $userId);
            }

            foreach ($bookings as $booking) {
                $this->actionLogMapper->deleteForEntity($userId, 'booking', $booking->getId());
                $this->actionLogMapper->deleteForLinkedEntity($userId, 'booking', $booking->getId());
                if ($booking->getUnitId() === null) {
                    $this->documentLinkMapper->deleteForEntity($userId, 'booking', $booking->getId());
                    $this->bookingMapper->delete($booking);
                }
            }
            $this->bookingYearMapper->deleteByProperty($id);

            if ($distributionKeyIds !== []) {
                $this->distributionKeyUnitMapper->deleteForKeys($distributionKeyIds, $userId);
            }
            foreach ($distributionKeys as $key) {
                $this->distributionKeyMapper->delete($key);
            }

            $this->partnerRelMapper->deleteForRelation('property', $property->getId(), $userId);
            $this->actionLogMapper->deleteForEntity($userId, 'property', $property->getId());
            $this->actionLogMapper->deleteForLinkedEntity($userId, 'property', $property->getId());
            $this->documentLinkMapper->deleteForEntity($userId, 'property', $property->getId());
            $workflowRuns = $this->workflowRunMapper->findByEntity('property', $property->getId());
            foreach ($workflowRuns as $run) {
                foreach ($this->taskStepMapper->findByRun($run->getId()) as $step) {
                    $this->taskStepMapper->delete($step);
                }
                $this->workflowRunMapper->delete($run);
            }
            $this->taskMapper->deleteByEntity('property', $property->getId());
            $this->propertyMapper->delete($property);
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
        $this->audit?->record('property.deleted', $id, $userId, $property->getTeamId(), $counts);
    }

    public function getDeletionSummary(int $id, string $userId): array {
        $property = $this->getPropertyForUser($id, $userId);
        $distributionKeys = $this->distributionKeyMapper->findByProperty($property->getId(), $userId);
        $distributionKeyIds = array_values(array_filter(array_map(fn($key) => $key->getId(), $distributionKeys)));
        $distributionValues = $distributionKeyIds === []
            ? 0
            : $this->distributionKeyUnitMapper->countForKeys($distributionKeyIds, $userId);

        $bookings = $this->bookingMapper->findByUser($userId, ['propertyId' => $id]);
        $bookingIds = array_map(fn($booking) => $booking->getId(), $bookings);
        $actionEntities = [['entityType' => 'property', 'entityId' => $id]];
        foreach ($bookingIds as $bookingId) {
            $actionEntities[] = ['entityType' => 'booking', 'entityId' => $bookingId];
        }

        return [
            'bookings' => count($bookings),
            'yearStatus' => $this->bookingYearMapper->countByProperty($id),
            'units' => $this->unitMapper->countByProperty($property->getId(), $userId),
            'tasks' => $this->taskMapper->countByEntity('property', $property->getId()),
            'taskSteps' => $this->taskStepMapper->countByEntity('property', $property->getId()),
            'workflowRuns' => count($this->workflowRunMapper->findByEntity('property', $property->getId())),
            'documentLinks' => $this->documentLinkMapper->countForEntity($userId, 'property', $property->getId())
                + $this->documentLinkMapper->countForEntities($userId, 'booking', $bookingIds),
            'actionLogs' => $this->actionLogMapper->countAffectedByEntities($userId, $actionEntities),
            'distributionKeys' => count($distributionKeys),
            'distributionValues' => $distributionValues,
            'partnerRelations' => count($this->partnerRelMapper->findForProperty($property->getId(), $userId)),
        ];
    }

    private function enrichProperty(Property $property, ?array $units = null, ?array $tenanciesByUnit = null, ?array $bookings = null): void {
        $this->entityImageService->enrichProperty($property);
        $units ??= $this->unitMapper->findByUser($property->getUserId(), $property->getId());
        $tenanciesByUnit ??= $this->tenancyService->listTenanciesByUnit($property->getUserId());
        foreach ($units as $unit) {
            $this->entityImageService->enrichUnit($unit, $property, false);
            $unit->setPropertyName($property->getName());
            $this->tenancyService->enrichUnitTenancies($unit, $tenanciesByUnit[$unit->getId()] ?? []);
        }
        $property->setUnits($units);
        $property->setUnitCount(count($units));
        $this->buildOccupancySummary($property, $units);

        $bookings ??= $this->loadBookings($property->getUserId(), $property->getId());
        $property->setBookings($bookings);
        $annualResult = 0.0;
        foreach ($bookings as $booking) {
            $amount = (float)$booking->getAmount();
            $annualResult += $amount;
        }
        $property->setAnnualResult(number_format($annualResult, 2, '.', ''));
        $property->setAnnualRentSum($this->calculateRentSum($units));
    }

    private function loadBookings(string $userId, ?int $propertyId = null): array {
        $bookings = $this->bookingMapper->findByUser($userId, $propertyId === null ? [] : ['propertyId' => $propertyId]);
        $bookingIds = array_values(array_filter(array_map(fn($booking) => $booking->getId(), $bookings)));
        if ($bookingIds !== []) {
            $documentedIds = $this->documentLinkMapper->findEntityIdsWithDocuments($userId, 'booking', $bookingIds);
            $documentedLookup = array_fill_keys($documentedIds, true);
            foreach ($bookings as $booking) {
                $booking->setHasDocuments(isset($documentedLookup[$booking->getId()]));
            }
        }
        return $bookings;
    }

    private function resolveUsageRoleFilter(string $role): string|bool|null {
        if ($this->permissionService->isBuildingManagement($role)) {
            return 'manager';
        }

        if ($this->permissionService->isLandlord($role)) {
            return false;
        }

        return null;
    }

    /** Annualized current rent, excluding expired and future conditions. */
    private function calculateRentSum(array $units): string {
        $monthlyRent = 0.0;
        foreach ($units as $unit) {
            foreach ($unit->getActiveTenancies() as $tenancy) {
                $monthlyRent += (float)$tenancy->getBaseRent();
            }
        }
        return number_format($monthlyRent * 12, 2, '.', '');
    }

    private function buildOccupancySummary(Property $property, array $units): void {
        $occupiedCount = 0;
        $activeTenancyCount = 0;
        foreach ($units as $unit) {
            $activeCount = count($unit->getActiveTenancies());
            $occupiedCount += $activeCount > 0 ? 1 : 0;
            $activeTenancyCount += $activeCount;
        }
        $property->setOccupiedUnitCount($occupiedCount);
        $property->setVacantUnitCount(count($units) - $occupiedCount);
        $property->setActiveTenancyCount($activeTenancyCount);
    }
}
