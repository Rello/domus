<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\ActionLogMapper;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\TaskStepMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\WorkflowRunMapper;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

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
        private TenancyMapper $tenancyMapper,
        private WorkflowRunMapper $workflowRunMapper,
        private TenancyService $tenancyService,
        private DocumentPathService $documentPathService,
        private UnitService $unitService,
        private PermissionService $permissionService,
        private EntityImageService $entityImageService,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function listPropertiesForUser(string $userId, string $role = 'landlord'): array {
        $usageRoleFilter = $this->resolveUsageRoleFilter($role);
        if ($usageRoleFilter === false) {
            return [];
        }

        $properties = $this->propertyMapper->findByUser($userId, $usageRoleFilter);
        foreach ($properties as $property) {
            $this->enrichProperty($property);
        }
        return $properties;
    }

    public function getPropertyForUser(int $id, string $userId): Property {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
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
        $property = $this->getPropertyForUser($id, $userId);
        $units = $this->unitMapper->findByUser($userId, $property->getId());
        $distributionKeys = $this->distributionKeyMapper->findByProperty($property->getId(), $userId);
        $distributionKeyIds = array_values(array_filter(array_map(fn($key) => $key->getId(), $distributionKeys)));

        foreach ($units as $unit) {
            $this->unitService->deleteUnit($unit->getId(), $userId);
        }

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
    }

    public function getDeletionSummary(int $id, string $userId): array {
        $property = $this->getPropertyForUser($id, $userId);
        $distributionKeys = $this->distributionKeyMapper->findByProperty($property->getId(), $userId);
        $distributionKeyIds = array_values(array_filter(array_map(fn($key) => $key->getId(), $distributionKeys)));
        $distributionValues = $distributionKeyIds === []
            ? 0
            : $this->distributionKeyUnitMapper->countForKeys($distributionKeyIds, $userId);

        return [
            'units' => $this->unitMapper->countByProperty($property->getId(), $userId),
            'tasks' => $this->taskMapper->countByEntity('property', $property->getId()),
            'taskSteps' => $this->taskStepMapper->countByEntity('property', $property->getId()),
            'workflowRuns' => count($this->workflowRunMapper->findByEntity('property', $property->getId())),
            'documentLinks' => $this->documentLinkMapper->countForEntity($userId, 'property', $property->getId()),
            'actionLogs' => $this->actionLogMapper->countAffectedByEntity($userId, 'property', $property->getId()),
            'distributionKeys' => count($distributionKeys),
            'distributionValues' => $distributionValues,
            'partnerRelations' => count($this->partnerRelMapper->findForProperty($property->getId(), $userId)),
        ];
    }

    private function enrichProperty(Property $property): void {
        try {
            $this->entityImageService->enrichProperty($property);
            $units = $this->unitMapper->findByUser($property->getUserId(), $property->getId());
            $unitIds = [];
            foreach ($units as $unit) {
                $this->enrichPropertyUnit($unit, $property);
                if ($unit->getId() !== null) {
                    $unitIds[] = (int)$unit->getId();
                }
            }
            $property->setUnits($units);
            $property->setUnitCount(count($units));
            $this->buildOccupancySummary($property, $unitIds);

            $bookings = $this->bookingMapper->findByUser($property->getUserId(), ['propertyId' => $property->getId()]);
            $bookingIds = array_values(array_filter(array_map(fn($booking) => $booking->getId(), $bookings)));
            if ($bookingIds !== []) {
                $documentedIds = $this->documentLinkMapper->findEntityIdsWithDocuments($property->getUserId(), 'booking', $bookingIds);
                $documentedLookup = array_fill_keys($documentedIds, true);
                foreach ($bookings as $booking) {
                    $booking->setHasDocuments(isset($documentedLookup[$booking->getId()]));
                }
            }
            $property->setBookings($bookings);
            $annualResult = 0.0;
            foreach ($bookings as $booking) {
                $amount = (float)$booking->getAmount();
                $annualResult += $amount;
            }
            $property->setAnnualResult(number_format($annualResult, 2, '.', ''));
            $property->setAnnualRentSum($this->calculateRentSum($property));
        } catch (\Throwable $e) {
            $this->logger->warning('Failed enriching property', ['message' => $e->getMessage()]);
        }
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

    private function calculateRentSum(Property $property): ?string {
        try {
            $units = $this->unitMapper->findByUser($property->getUserId(), $property->getId());
            $unitIds = array_values(array_filter(array_map(static fn(Unit $unit) => $unit->getId(), $units)));
            if ($unitIds === []) {
                return number_format(0, 2, '.', '');
            }

            $tenancies = $this->tenancyMapper->findByUser($property->getUserId());
            $tenancies = array_filter($tenancies, static fn($tenancy) => in_array((int)$tenancy->getUnitId(), $unitIds, true));
            $sum = 0.0;
            foreach ($tenancies as $tenancy) {
                $sum += (float)$tenancy->getBaseRent();
            }
            return number_format($sum * 12, 2, '.', '');
        } catch (\Throwable $e) {
            $this->logger->warning('Failed calculating rent sum', ['message' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * @param int[] $unitIds
     */
    private function buildOccupancySummary(Property $property, array $unitIds): void {
        $today = new \DateTimeImmutable('today');
        $occupiedUnitIds = [];
        $activeTenancyCount = 0;

        if ($unitIds !== []) {
            $tenancies = $this->tenancyMapper->findByUser($property->getUserId());
            foreach ($tenancies as $tenancy) {
                $unitId = (int)$tenancy->getUnitId();
                if (!in_array($unitId, $unitIds, true)) {
                    continue;
                }
                if ($this->tenancyService->getStatus($tenancy, $today) !== 'active') {
                    continue;
                }
                $occupiedUnitIds[$unitId] = true;
                $activeTenancyCount += 1;
            }
        }

        $occupiedCount = count($occupiedUnitIds);
        $totalCount = count($unitIds);
        $property->setOccupiedUnitCount($occupiedCount);
        $property->setVacantUnitCount(max(0, $totalCount - $occupiedCount));
        $property->setActiveTenancyCount($activeTenancyCount);
    }

    private function enrichPropertyUnit(Unit $unit, Property $property): void {
        $this->entityImageService->enrichUnit($unit, $property, false);
        $unit->setPropertyName($property->getName());

        $tenancies = $this->tenancyService->listTenancies($property->getUserId(), (int)$unit->getId());
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
