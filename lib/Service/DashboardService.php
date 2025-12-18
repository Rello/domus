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
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
    }

    public function getSummary(string $userId, int $year, string $role = 'landlord'): array {
        $isBuildingManagement = $this->permissionService->isBuildingManagement($role);
        $properties = $this->propertyMapper->findByUser($userId);
        $propertyIds = array_map(fn($property) => $property->getId(), $properties);

        $units = $this->unitMapper->findByUser($userId);
        if ($isBuildingManagement) {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() !== null);
        }
        $unitIds = array_map(fn($unit) => $unit->getId(), $units);

        $tenancies = $this->tenancyService->listTenancies($userId);
        $partnerType = $isBuildingManagement ? 'owner' : 'tenant';
        $tenancies = $this->filterTenanciesForRole($tenancies, $partnerType, $unitIds, $isBuildingManagement);
        $activeTenancies = array_filter($tenancies, function (Tenancy $tenancy) {
            $status = $tenancy->getStatus();
            if ($status !== null) {
                return in_array($status, ['active', 'future'], true);
            }

            $endDate = $tenancy->getEndDate();
            return $endDate === null || $endDate >= date('Y-m-d');
        });

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
            $unitCount = $this->unitMapper->countByProperty($property->getId(), $userId);
            return [
                'id' => $property->getId(),
                'name' => $property->getName(),
                'city' => $property->getCity(),
                'unitCount' => $unitCount,
            ];
        }, $properties);

        return [
            'propertyCount' => count($properties),
            'unitCount' => count($units),
            'tenancyCount' => count($activeTenancies),
            'bookingCount' => count($bookings),
            'properties' => $propertyOverview,
            'monthlyBaseRentSum' => number_format($rentSum, 2, '.', ''),
            'annualResult' => number_format($income - $expense, 2, '.', ''),
        ];
    }

    private function filterTenanciesForRole(array $tenancies, string $expectedPartnerType, array $unitIds, bool $requirePropertyBoundUnits): array {
        return array_values(array_filter($tenancies, function (Tenancy $tenancy) use ($expectedPartnerType, $unitIds, $requirePropertyBoundUnits) {
            if ($requirePropertyBoundUnits && !in_array($tenancy->getUnitId(), $unitIds, true)) {
                return false;
            }

            $partners = $tenancy->getPartners();
            if (empty($partners)) {
                return !$requirePropertyBoundUnits;
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
