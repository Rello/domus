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

        $startDate = (new \DateTimeImmutable('first day of january'))->format('Y-m-d');

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

        $distributionUnitId = $this->createLandlordDistributionDemo($userId, $role);
        $this->createDemoTask($unit->getId(), $userId);
        $this->createDemoBookings($userId, ['unitId' => $unit->getId()]);

        return [
            'unitId' => $unit->getId(),
            'tenantId' => $tenant->getId(),
            'facilitiesId' => $facilities->getId(),
            'distributionUnitId' => $distributionUnitId,
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
        $this->createDemoBookings($userId, ['propertyId' => $property->getId()]);

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

    private function createDemoBookings(string $userId, array $relation): void {
        $year = (new \DateTimeImmutable('today'))->format('Y');
        $bookings = [
            [
                'account' => 2000,
                'date' => $year . '-01-15',
                'amount' => '320.50',
                'description' => $this->l10n->t('Heating and water maintenance'),
            ],
            [
                'account' => 2100,
                'date' => $year . '-02-10',
                'amount' => '110.00',
                'description' => $this->l10n->t('Elevator service contract'),
            ],
            [
                'account' => 2200,
                'date' => $year . '-03-05',
                'amount' => '150.00',
                'description' => $this->l10n->t('Reserve fund contribution'),
            ],
            [
                'account' => 2300,
                'date' => $year . '-04-08',
                'amount' => '85.00',
                'description' => $this->l10n->t('Minor repairs and supplies'),
            ],
            [
                'account' => 2400,
                'date' => $year . '-05-20',
                'amount' => '240.00',
                'description' => $this->l10n->t('Quarterly property tax'),
            ],
            [
                'account' => 2600,
                'date' => $year . '-06-12',
                'amount' => '300.00',
                'description' => $this->l10n->t('Annual depreciation booking'),
            ],
            [
                'account' => 2700,
                'date' => $year . '-07-18',
                'amount' => '65.00',
                'description' => $this->l10n->t('Tax advisor fees'),
            ],
        ];

        foreach ($bookings as $booking) {
            $this->bookingService->createBooking(array_merge($booking, $relation), $userId);
        }
    }

    private function createLandlordDistributionDemo(string $userId, string $role): int {
        $property = $this->propertyService->createProperty([
            'name' => $this->l10n->t('Demo distribution property'),
            'usageRole' => 'landlord',
            'street' => $this->l10n->t('Harbor Street 7'),
            'zip' => '12345',
            'city' => $this->l10n->t('Sampletown'),
            'type' => $this->l10n->t('Residential building'),
            'description' => $this->l10n->t('Property used to showcase MEA distributions.'),
        ], $userId);

        $unit = $this->unitService->createUnit([
            'propertyId' => $property->getId(),
            'label' => $this->l10n->t('Distribution demo unit'),
            'unitNumber' => 'D-01',
            'livingArea' => '55',
            'unitType' => $this->l10n->t('Apartment'),
            'totalCosts' => '200000',
            'notes' => $this->l10n->t('Unit used for MEA distribution example.'),
        ], $userId, $role);

        $validFrom = (new \DateTimeImmutable('first day of january'))->format('Y-m-d');
        $now = time();
        $distributionKey = new DistributionKey();
        $distributionKey->setUserId($userId);
        $distributionKey->setPropertyId($property->getId());
        $distributionKey->setType('mea');
        $distributionKey->setName($this->l10n->t('MEA distribution'));
        $distributionKey->setConfigJson(json_encode(['base' => 10000]));
        $distributionKey->setValidFrom($validFrom);
        $distributionKey->setValidTo(null);
        $distributionKey->setCreatedAt($now);
        $distributionKey->setUpdatedAt($now);
        $distributionKey = $this->distributionKeyMapper->insert($distributionKey);

        $unitValue = new DistributionKeyUnit();
        $unitValue->setUserId($userId);
        $unitValue->setDistributionKeyId($distributionKey->getId());
        $unitValue->setUnitId($unit->getId());
        $unitValue->setValue(2000);
        $unitValue->setValidFrom($validFrom);
        $unitValue->setValidTo(null);
        $unitValue->setCreatedAt($now);
        $unitValue->setUpdatedAt($now);
        $this->distributionKeyUnitMapper->insert($unitValue);

        return $unit->getId();
    }
}
