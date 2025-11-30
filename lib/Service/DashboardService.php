<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;

class DashboardService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private TenancyMapper $tenancyMapper,
        private BookingMapper $bookingMapper
    ) {
    }

    public function summary(string $userId, int $year): array {
        $properties = $this->propertyMapper->getQueryBuilder();
        $properties->select('COUNT(*) as propertyCount')
            ->from('domus_properties')
            ->where($properties->expr()->eq('user_id', $properties->createNamedParameter($userId)));
        $propertyCount = (int)$properties->executeQuery()->fetchOne();

        $tenancies = $this->tenancyMapper->getQueryBuilder();
        $tenancies->select('COUNT(*) as tenancyCount')
            ->from('domus_tenancies')
            ->where($tenancies->expr()->eq('user_id', $tenancies->createNamedParameter($userId)));
        $tenancyCount = (int)$tenancies->executeQuery()->fetchOne();

        $bookings = $this->bookingMapper->getQueryBuilder();
        $bookings->select('SUM(amount) as totalAmount')
            ->from('domus_bookings')
            ->where($bookings->expr()->eq('user_id', $bookings->createNamedParameter($userId)))
            ->andWhere($bookings->expr()->eq('YEAR(date)', $bookings->createNamedParameter($year)));
        $totalAmount = (float)$bookings->executeQuery()->fetchOne();

        return [
            'propertyCount' => $propertyCount,
            'tenancyCount' => $tenancyCount,
            'totalAmount' => $totalAmount,
        ];
    }
}
