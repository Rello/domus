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
        $propertyCount = $this->propertyMapper->countByUser($userId);
        $tenancyCount = $this->tenancyMapper->countByUser($userId);
        $totalAmount = $this->bookingMapper->sumAmountByYear($userId, $year);

        return [
            'propertyCount' => $propertyCount,
            'tenancyCount' => $tenancyCount,
            'totalAmount' => $totalAmount,
        ];
    }
}
