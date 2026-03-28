<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class DashboardService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private TenancyService $tenancyService,
        private BookingMapper $bookingMapper,
        private TaskService $taskService,
        private WorkflowRunService $workflowRunService,
        private PermissionService $permissionService,
        private EntityImageService $entityImageService,
        private IL10N $l10n,
    ) {
    }

    public function getSummary(string $userId, int $year, string $role = 'landlord'): array {
        $isBuildingManagement = $this->permissionService->isBuildingManagement($role);
        $isLandlord = $this->permissionService->isLandlord($role);
        $properties = $this->propertyMapper->findByUser($userId);
        $propertyIds = array_map(fn($property) => $property->getId(), $properties);

        $units = $this->unitMapper->findByUser($userId);
        $units = array_filter($units, function ($unit) use ($isBuildingManagement) {
            $hasProperty = $unit->getPropertyId() !== null;
            return $isBuildingManagement ? $hasProperty : !$hasProperty;
        });
        $unitIds = array_map(fn($unit) => $unit->getId(), $units);

        $tenancies = $this->tenancyService->listTenancies($userId);
        $partnerType = $isBuildingManagement ? 'owner' : null;
        $tenancies = $this->filterTenanciesForRole($tenancies, $partnerType, $unitIds, !$isBuildingManagement);
        $activeTenancies = array_filter($tenancies, function (Tenancy $tenancy) {
            $status = $tenancy->getStatus();
            if ($status !== null) {
                return in_array($status, ['active', 'future'], true);
            }

            $endDate = $tenancy->getEndDate();
            return $endDate === null || $endDate >= date('Y-m-d');
        });
        $occupiedUnitIds = [];
        foreach ($tenancies as $tenancy) {
            if ($tenancy->getStatus() === 'active') {
                $occupiedUnitIds[(int)$tenancy->getUnitId()] = true;
            }
        }

        $bookings = $this->bookingMapper->findByUser($userId, ['year' => $year]);
        if ($isBuildingManagement) {
            $bookings = array_filter($bookings, fn(Booking $booking) => $this->bookingMatchesManagedScope($booking, $propertyIds, $unitIds));
        }

        $rentSum = 0.0;
        foreach ($activeTenancies as $tenancy) {
            $rentSum += (float)$tenancy->getBaseRent();
        }

        $income = 0.0;
        $expense = 0.0;
        foreach ($bookings as $booking) {
            $amount = (float)$booking->getAmount();
            if ($amount >= 0) {
                $income += $amount;
            } else {
                $expense += abs($amount);
            }
        }

        $propertyOverview = array_map(function ($property) use ($userId) {
            $this->entityImageService->enrichProperty($property);
            $unitCount = $this->unitMapper->countByProperty($property->getId(), $userId);
            return [
                'id' => $property->getId(),
                'name' => $property->getName(),
                'city' => $property->getCity(),
                'unitCount' => $unitCount,
                'resolvedImageUrl' => $property->getResolvedImageUrl(),
            ];
        }, $properties);

        $openTasks = [];
        if ($role !== 'tenant') {
            $entityMap = [];
            foreach ($properties as $property) {
                $propertyId = $property->getId();
                if ($propertyId === null) {
                    continue;
                }
                $this->entityImageService->enrichProperty($property);
                $entityMap['property:' . $propertyId] = [
                    'entityType' => 'property',
                    'entityId' => (int)$propertyId,
                    'name' => $property->getName(),
                    'imageUrl' => $property->getResolvedImageUrl(),
                ];
            }
            foreach ($units as $unit) {
                $this->entityImageService->enrichUnit($unit, null, false);
                $unitId = $unit->getId();
                if ($unitId === null) {
                    continue;
                }
                $entityMap['unit:' . $unitId] = [
                    'entityType' => 'unit',
                    'entityId' => (int)$unitId,
                    'name' => $unit->getLabel(),
                    'imageUrl' => $unit->getResolvedImageUrl(),
                ];
            }
            $openTasks = array_merge(
                $this->workflowRunService->listOpenStepsForUser($userId, $role),
                array_map(function ($task) use ($entityMap) {
                    $entityType = (string)$task->getEntityType();
                    $entityId = (int)$task->getEntityId();
                    $entityMeta = $entityMap[$entityType . ':' . $entityId] ?? ['name' => '', 'imageUrl' => null];
                    return [
                        'type' => 'task',
                        'taskId' => $task->getId(),
                        'entityType' => $entityType,
                        'entityId' => $entityId,
                        'entityName' => $entityMeta['name'] ?? '',
                        'entityImageUrl' => $entityMeta['imageUrl'] ?? null,
                        'title' => $task->getTitle(),
                        'dueDate' => $task->getDueDate(),
                    ];
                }, $this->taskService->listOpenTasks($userId, $role))
            );
        }

        return [
            'propertyCount' => count($properties),
            'unitCount' => count($units),
            'tenancyCount' => count($activeTenancies),
            'bookingCount' => count($bookings),
            'properties' => $propertyOverview,
            'monthlyBaseRentSum' => number_format($rentSum, 2, '.', ''),
            'annualResult' => number_format($income - $expense, 2, '.', ''),
            'openTasks' => $openTasks,
            'occupancy' => $isLandlord ? [
                'occupied' => count($occupiedUnitIds),
                'vacant' => max(0, count($units) - count($occupiedUnitIds)),
            ] : null,
        ];
    }

    private function filterTenanciesForRole(array $tenancies, ?string $expectedPartnerType, array $unitIds, bool $allowPartnerless): array {
        $unitScope = array_map('intval', $unitIds);

        return array_values(array_filter($tenancies, function (Tenancy $tenancy) use ($expectedPartnerType, $unitScope, $allowPartnerless) {
            if (!empty($unitScope) && !in_array((int)$tenancy->getUnitId(), $unitScope, true)) {
                return false;
            }

            $partners = $tenancy->getPartners();
            if ($expectedPartnerType === null) {
                return true;
            }

            if (empty($partners)) {
                return $allowPartnerless;
            }

            foreach ($partners as $partner) {
                if ($partner->getPartnerType() === $expectedPartnerType) {
                    return true;
                }
            }

            return false;
        }));
    }

    private function bookingMatchesManagedScope(Booking $booking, array $propertyIds, array $unitIds): bool {
        $propertyId = $booking->getPropertyId();
        $unitId = $booking->getUnitId();

        if ($propertyId !== null && in_array($propertyId, $propertyIds, true)) {
            return true;
        }

        if ($unitId !== null && in_array($unitId, $unitIds, true)) {
            return true;
        }

        return false;
    }
}
