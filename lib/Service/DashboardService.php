<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class DashboardService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private TenancyMapper $tenancyMapper,
        private BookingMapper $bookingMapper,
        private IL10N $l10n,
    ) {
    }

    public function getSummary(string $userId, int $year): array {
        $properties = $this->propertyMapper->findByUser($userId);
        $units = $this->unitMapper->findByUser($userId);
        $tenancies = $this->tenancyMapper->findByUser($userId);
        $activeTenancies = array_filter($tenancies, fn($t) => $t->getEndDate() === null || $t->getEndDate() >= date('Y-m-d'));
        $bookings = $this->bookingMapper->findByUser($userId, ['year' => $year]);

        $rentSum = 0.0;
        foreach ($tenancies as $tenancy) {
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

        $propertyOverview = array_map(function($property) use ($userId) {
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
}
