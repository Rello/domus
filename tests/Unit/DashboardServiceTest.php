<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Unit, Booking, Tenancy, Partner, Property};
use OCA\Domus\Service\DashboardService;
use PHPUnit\Framework\TestCase;

class DashboardServiceTest extends TestCase {
    /** @dataProvider scopes */
    public function testSummaryUsesCurrentTenanciesAndRoleScope(string $role, bool $empty, int $expectedBookings, float $expectedRentability): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(DashboardService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['permissionService']->method('isLandlord')->willReturn($role === 'landlord');
        $dependencies['permissionService']->method('isBuildingManagement')->willReturn($role === 'buildingMgmt');
        $units = [];
        foreach ([1 => null, 2 => 10] as $id => $propertyId) {
            $unit = new Unit(); $unit->setId($id); $unit->setPropertyId($propertyId); $unit->setTotalCosts('100000'); $units[] = $unit;
        }
        $dependencies['unitMapper']->method('findByUser')->willReturn($empty ? [] : $units);
        $property = new Property(); $property->setId(10);
        $dependencies['propertyMapper']->method('findByUser')->willReturn([$property]);
        $tenancies = [];
        foreach ([1, 2] as $unitId) {
            foreach (['active', 'future', 'historical'] as $status) {
                $tenancy = new Tenancy(); $tenancy->setUnitId($unitId); $tenancy->setStatus($status); $tenancy->setBaseRent('1000');
                $partner = new Partner(); $partner->setPartnerType($unitId === 2 ? 'owner' : 'tenant'); $tenancy->setPartners([$partner]);
                $tenancies[] = $tenancy;
            }
        }
        $dependencies['tenancyService']->method('listTenancies')->willReturn($tenancies);
        $dependencies['tenancyService']->method('sumTenancyForYear')->willReturn(['1000' => 12000.0]);
        $bookings = [];
        foreach ([[1, null, 1000], [2, 10, 2000], [null, 10, 3000]] as [$unitId, $propertyId, $amount]) {
            $booking = new Booking(); $booking->setUnitId($unitId); $booking->setPropertyId($propertyId); $booking->setAmount($amount); $booking->setAccount('2100'); $bookings[] = $booking;
        }
        $dependencies['bookingMapper']->method('findByUser')->willReturn($bookings);
        $dependencies['accountService']->method('getTopAccountNumberMap')->willReturn([]);
        $dependencies['accountService']->method('resolveTopAccountNumber')->willReturnCallback(fn($number) => $number);
        $dependencies['config']->method('getUserValue')->willReturn('0');
        $service = new DashboardService(...array_values($dependencies));
        $summary = $service->getSummary('alice', 2026, $role);
        self::assertSame($empty ? '0.00' : '1000.00', $summary['monthlyBaseRentSum']);
        self::assertSame($empty ? 0 : 1, $summary['tenancyCount']);
        self::assertSame($expectedBookings, $summary['bookingCount']);
        if ($empty) { self::assertNull($summary['overallRentability']); }
        else { self::assertEqualsWithDelta($expectedRentability, $summary['overallRentability'], 0.00001); }
    }

    public static function scopes(): array {
        return [
            ['landlord', false, 1, 0.11],
            ['landlord', true, 0, 0.0],
            ['buildingMgmt', false, 2, 0.07],
            ['buildingMgmt', true, 2, 0.0],
        ];
    }
}
