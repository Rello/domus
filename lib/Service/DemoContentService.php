<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\DistributionKey;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnit;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCP\IDBConnection;
use OCP\IL10N;

class DemoContentService {
    public function __construct(
        private PropertyService $propertyService,
        private UnitService $unitService,
        private PartnerService $partnerService,
        private TenancyService $tenancyService,
        private PartnerRelationService $partnerRelationService,
        private TaskService $taskService,
        private BookingService $bookingService,
        private BookingYearService $bookingYearService,
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    public function createDemoContent(string $userId, string $role): array {
        $this->connection->beginTransaction();

        try {
            $data = $role === 'buildingMgmt'
                ? $this->createBuildingManagementDemoContent($userId, $role)
                : $this->createLandlordDemoContent($userId, $role);

            $this->connection->commit();

            return $data;
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    private function createLandlordDemoContent(string $userId, string $role): array {
        $unit = $this->unitService->createUnit([
            'label' => $this->l10n->t('Demo apartment'),
            'unitNumber' => 'A-101',
            'livingArea' => '72',
            'unitType' => $this->l10n->t('Apartment'),
            'totalCosts' => '200000',
            'notes' => $this->l10n->t('Sample unit used to explore Domus features.'),
        ], $userId, $role);

        $tenant = $this->partnerService->createPartner([
            'partnerType' => 'tenant',
            'name' => $this->l10n->t('Demo renter'),
            'street' => $this->l10n->t('Market Street 12'),
            'zip' => '12345',
            'city' => $this->l10n->t('Sampletown'),
            'email' => 'renter@example.com',
            'phone' => '+49 30 1234567',
            'notes' => $this->l10n->t('Primary tenant for the demo tenancy.'),
        ], $userId, $role);

        $facilities = $this->partnerService->createPartner([
            'partnerType' => 'facilities',
            'name' => $this->l10n->t('Demo facilities partner'),
            'street' => $this->l10n->t('Service Alley 5'),
            'zip' => '12345',
            'city' => $this->l10n->t('Sampletown'),
            'email' => 'service@example.com',
            'phone' => '+49 30 7654321',
            'notes' => $this->l10n->t('Facilities partner for cleaning and minor repairs.'),
        ], $userId, $role);

        $startDate = (new \DateTimeImmutable('first day of january last year'))->format('Y-m-d');

        $this->tenancyService->createTenancy([
            'unitId' => $unit->getId(),
            'startDate' => $startDate,
            'baseRent' => '950',
            'serviceCharge' => '180',
            'deposit' => '1900',
            'conditions' => $this->l10n->t('Open-ended tenancy with annual index adjustment.'),
            'partnerIds' => [$tenant->getId()],
        ], $userId, $role);

        $this->partnerRelationService->createRelation('unit', $unit->getId(), [
            'partnerId' => $facilities->getId(),
        ], $userId, $role);

        $this->createDemoTask($unit->getId(), $userId);
        $this->createDemoBookings($userId, ['unitId' => $unit->getId()], $unit->getId());

        return [
            'unitId' => $unit->getId(),
            'tenantId' => $tenant->getId(),
            'facilitiesId' => $facilities->getId(),
        ];
    }

    private function createBuildingManagementDemoContent(string $userId, string $role): array {
        $property = $this->propertyService->createProperty([
            'name' => $this->l10n->t('Demo property'),
            'usageRole' => 'manager',
            'street' => $this->l10n->t('Harbor Street 7'),
            'zip' => '54321',
            'city' => $this->l10n->t('Sampletown'),
            'type' => $this->l10n->t('Residential building'),
            'description' => $this->l10n->t('Demo property used to showcase building management features.'),
        ], $userId);

        $unit = $this->unitService->createUnit([
            'propertyId' => $property->getId(),
            'label' => $this->l10n->t('Demo unit'),
            'unitNumber' => 'B-12',
            'livingArea' => '68',
            'unitType' => $this->l10n->t('Apartment'),
            'totalCosts' => '200000',
            'notes' => $this->l10n->t('Unit linked to the demo property.'),
        ], $userId, $role);

        $owner = $this->partnerService->createPartner([
            'partnerType' => 'owner',
            'name' => $this->l10n->t('Demo owner'),
            'street' => $this->l10n->t('Owner Avenue 3'),
            'zip' => '54321',
            'city' => $this->l10n->t('Sampletown'),
            'email' => 'owner@example.com',
            'phone' => '+49 30 1112233',
            'notes' => $this->l10n->t('Primary owner for the demo property.'),
        ], $userId, $role);

        $facilities = $this->partnerService->createPartner([
            'partnerType' => 'facilities',
            'name' => $this->l10n->t('Demo facilities team'),
            'street' => $this->l10n->t('Service Alley 5'),
            'zip' => '54321',
            'city' => $this->l10n->t('Sampletown'),
            'email' => 'building-service@example.com',
            'phone' => '+49 30 998877',
            'notes' => $this->l10n->t('Facilities partner for the demo property.'),
        ], $userId, $role);

        $startDate = (new \DateTimeImmutable('first day of january'))->format('Y-m-d');

        $this->tenancyService->createTenancy([
            'unitId' => $unit->getId(),
            'startDate' => $startDate,
            'conditions' => $this->l10n->t('Owner occupancy agreement for management overview.'),
            'partnerIds' => [$owner->getId()],
        ], $userId, $role);

        $this->partnerRelationService->createRelation('property', $property->getId(), [
            'partnerId' => $facilities->getId(),
        ], $userId, $role);

        $this->partnerRelationService->createRelation('property', $property->getId(), [
            'partnerId' => $owner->getId(),
        ], $userId, $role);

        $this->createDemoTask($unit->getId(), $userId);
        $distributionKeyIds = $this->createPropertyDistributions($property->getId(), $unit->getId(), $userId);
        $this->createPropertyDemoBookings($userId, $property->getId(), $distributionKeyIds);

        return [
            'propertyId' => $property->getId(),
            'unitId' => $unit->getId(),
            'ownerId' => $owner->getId(),
            'facilitiesId' => $facilities->getId(),
        ];
    }

    private function createDemoTask(int $unitId, string $userId): void {
        $dueDate = (new \DateTimeImmutable('+14 days'))->format('Y-m-d');
        $this->taskService->createTask(
            $unitId,
            $this->l10n->t('Check smoke detectors'),
            $this->l10n->t('Schedule the annual safety inspection for the unit.'),
            $dueDate,
            $userId,
        );
    }

    private function createDemoBookings(string $userId, array $relation, int $unitId): void {
        $currentYear = (int)(new \DateTimeImmutable('today'))->format('Y');
        $previousYear = $currentYear - 1;
        $bookings = [
            [
                'account' => 2000,
                'monthDay' => '01-15',
                'amounts' => [
                    'current' => '320.50',
                    'previous' => '315.50',
                ],
                'description' => $this->l10n->t('Heating and water maintenance'),
            ],
            [
                'account' => 2100,
                'monthDay' => '02-10',
                'amounts' => [
                    'current' => '110.00',
                    'previous' => '105.00',
                ],
                'description' => $this->l10n->t('Elevator service contract'),
            ],
            [
                'account' => 2200,
                'monthDay' => '03-05',
                'amounts' => [
                    'current' => '150.00',
                    'previous' => '145.00',
                ],
                'description' => $this->l10n->t('Reserve fund contribution'),
            ],
            [
                'account' => 2300,
                'monthDay' => '04-08',
                'amounts' => [
                    'current' => '85.00',
                    'previous' => '80.00',
                ],
                'description' => $this->l10n->t('Minor repairs and supplies'),
            ],
            [
                'account' => 2400,
                'monthDay' => '05-20',
                'amounts' => [
                    'current' => '240.00',
                    'previous' => '235.00',
                ],
                'description' => $this->l10n->t('Quarterly property tax'),
            ],
            [
                'account' => 2600,
                'monthDay' => '06-12',
                'amounts' => [
                    'current' => '300.00',
                    'previous' => '295.00',
                ],
                'description' => $this->l10n->t('Annual depreciation booking'),
            ],
            [
                'account' => 2700,
                'monthDay' => '07-18',
                'amounts' => [
                    'current' => '65.00',
                    'previous' => '60.00',
                ],
                'description' => $this->l10n->t('Tax advisor fees'),
            ],
        ];

        foreach ($bookings as $booking) {
            $this->bookingService->createBooking(array_merge($relation, [
                'account' => $booking['account'],
                'date' => $previousYear . '-' . $booking['monthDay'],
                'amount' => $booking['amounts']['previous'],
                'description' => $booking['description'],
            ]), $userId);

            $this->bookingService->createBooking(array_merge($relation, [
                'account' => $booking['account'],
                'date' => $currentYear . '-' . $booking['monthDay'],
                'amount' => $booking['amounts']['current'],
                'description' => $booking['description'],
            ]), $userId);
        }

        $this->bookingYearService->closeYear($previousYear, null, $unitId, $userId);
    }

    /**
     * @return array<string,int>
     */
    private function createPropertyDistributions(int $propertyId, int $unitId, string $userId): array {
        $validFrom = (new \DateTimeImmutable('first day of january'))->format('Y-m-d');
        $now = time();
        $keys = [
            'unit' => [
                'label' => $this->l10n->t('Unit distribution'),
                'base' => 150,
            ],
            'area' => [
                'label' => $this->l10n->t('Area distribution'),
                'base' => 1000,
            ],
            'mea' => [
                'label' => $this->l10n->t('MEA distribution'),
                'base' => 10000,
            ],
        ];
        $ids = [];

        foreach ($keys as $type => $config) {
            $distributionKey = new DistributionKey();
            $distributionKey->setUserId($userId);
            $distributionKey->setPropertyId($propertyId);
            $distributionKey->setType($type);
            $distributionKey->setName($config['label']);
            $distributionKey->setConfigJson(json_encode(['base' => $config['base']]));
            $distributionKey->setValidFrom($validFrom);
            $distributionKey->setValidTo(null);
            $distributionKey->setCreatedAt($now);
            $distributionKey->setUpdatedAt($now);
            $distributionKey = $this->distributionKeyMapper->insert($distributionKey);
            $ids[$type] = $distributionKey->getId();
        }

        $unitValue = new DistributionKeyUnit();
        $unitValue->setUserId($userId);
        $unitValue->setDistributionKeyId($ids['mea']);
        $unitValue->setUnitId($unitId);
        $unitValue->setValue(2000);
        $unitValue->setValidFrom($validFrom);
        $unitValue->setValidTo(null);
        $unitValue->setCreatedAt($now);
        $unitValue->setUpdatedAt($now);
        $this->distributionKeyUnitMapper->insert($unitValue);

        return $ids;
    }

    /**
     * @param array<string,int> $distributionKeyIds
     */
    private function createPropertyDemoBookings(string $userId, int $propertyId, array $distributionKeyIds): void {
        $year = (new \DateTimeImmutable('today'))->format('Y');
        $bookings = [
            [
                'account' => 4001,
                'date' => $year . '-02-01',
                'amount' => '420.00',
                'description' => $this->l10n->t('Maintenance booking A'),
                'distributionKeyId' => $distributionKeyIds['unit'] ?? null,
            ],
            [
                'account' => 4002,
                'date' => $year . '-03-10',
                'amount' => '510.00',
                'description' => $this->l10n->t('Maintenance booking B'),
                'distributionKeyId' => $distributionKeyIds['area'] ?? null,
            ],
            [
                'account' => 4003,
                'date' => $year . '-04-15',
                'amount' => '390.00',
                'description' => $this->l10n->t('Maintenance booking C'),
                'distributionKeyId' => $distributionKeyIds['mea'] ?? null,
            ],
        ];

        foreach ($bookings as $booking) {
            $this->bookingService->createBooking(array_merge($booking, [
                'propertyId' => $propertyId,
            ]), $userId);
        }
    }
}
