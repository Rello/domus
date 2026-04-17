<?php

namespace OCA\Domus\Service;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Db\DistributionKey;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnit;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IDBConnection;
use OCP\IConfig;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class DemoContentService {
    private const CONFIG_INITIAL_DEMO_CONTENT_CREATED = 'initialDemoContentCreated';

    public function __construct(
        private PropertyService $propertyService,
        private UnitService $unitService,
        private PartnerService $partnerService,
        private TenancyService $tenancyService,
        private PartnerRelationService $partnerRelationService,
        private TaskService $taskService,
        private BookingService $bookingService,
        private BookingYearService $bookingYearService,
        private UnitMapper $unitMapper,
        private WorkflowRunService $workflowRunService,
        private ActionLogService $actionLogService,
        private DocumentService $documentService,
        private EntityImageService $entityImageService,
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private TaskTemplateMapper $taskTemplateMapper,
        private IDBConnection $connection,
        private IConfig $config,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function createInitialDemoContentIfNeeded(string $userId): void {
        if ($userId === '') {
            return;
        }

        try {
            $hasCreatedDemo = $this->config->getUserValue(
                $userId,
                Application::APP_ID,
                self::CONFIG_INITIAL_DEMO_CONTENT_CREATED,
                '0',
            ) === '1';
            if ($hasCreatedDemo || $this->hasUnits($userId)) {
                return;
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to evaluate initial demo content preconditions', [
                'userId' => $userId,
                'message' => $e->getMessage(),
            ]);
            return;
        }

        $this->config->setUserValue($userId, Application::APP_ID, self::CONFIG_INITIAL_DEMO_CONTENT_CREATED, '1');

        try {
            $this->createDemoContent($userId, 'landlord');
        } catch (\Throwable $e) {
            $this->config->setUserValue($userId, Application::APP_ID, self::CONFIG_INITIAL_DEMO_CONTENT_CREATED, '0');
            $this->logger->warning('Failed to create initial demo content', [
                'userId' => $userId,
                'message' => $e->getMessage(),
            ]);
        }
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
            'street' => $this->l10n->t('Market Street 12'),
            'zip' => '12345',
            'city' => $this->l10n->t('Sampletown'),
            'country' => 'DE',
            'unitNumber' => 'A-101',
            'livingArea' => '72',
            'unitType' => $this->l10n->t('Apartment'),
            'totalCosts' => '200000',
            'notes' => $this->l10n->t('Sample unit used to explore Domus features.'),
        ], $userId, $role);
        $this->assignDemoApartmentImage($unit->getId(), $userId);

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

        $this->createDemoCompletedTenancy($unit->getId(), $userId, $role);
        $this->createDemoTask($unit->getId(), $userId);
        $this->startDemoYearEndProcess($unit->getId(), $userId);
        $this->createDemoBookings($userId, ['unitId' => $unit->getId()], $unit->getId());
        $this->createDemoDocuments($userId, $unit->getId());
        $this->createDemoActionLogs($userId, 'unit', $unit->getId(), $tenant->getId());

        return [
            'unitId' => $unit->getId(),
            'tenantId' => $tenant->getId(),
            'facilitiesId' => $facilities->getId(),
        ];
    }

    private function assignDemoApartmentImage(?int $unitId, string $userId): void {
        if (!$unitId) {
            return;
        }

        $this->entityImageService->applyBundledUnitImage($unitId, $userId, 'img/pictures/apartment.png');
    }

    private function hasUnits(string $userId): bool {
        return $this->unitMapper->findByUser($userId) !== [];
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
            'street' => $this->l10n->t('Harbor Street 7'),
            'zip' => '54321',
            'city' => $this->l10n->t('Sampletown'),
            'country' => 'DE',
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
        $this->startDemoYearEndProcess($unit->getId(), $userId);
        $distributionKeyIds = $this->createPropertyDistributions($property->getId(), $unit->getId(), $userId);
        $this->createPropertyDemoBookings($userId, $property->getId(), $distributionKeyIds);
        $this->createDemoActionLogs($userId, 'property', $property->getId(), $unit->getId(), 'unit');

        return [
            'propertyId' => $property->getId(),
            'unitId' => $unit->getId(),
            'ownerId' => $owner->getId(),
            'facilitiesId' => $facilities->getId(),
        ];
    }

    private function createDemoCompletedTenancy(int $unitId, string $userId, string $role): void {
        $formerTenant = $this->partnerService->createPartner([
            'partnerType' => 'tenant',
            'name' => $this->l10n->t('Former demo renter'),
            'street' => $this->l10n->t('Market Street 12'),
            'zip' => '12345',
            'city' => $this->l10n->t('Sampletown'),
            'email' => 'former-renter@example.com',
            'phone' => '+49 30 1234555',
            'notes' => $this->l10n->t('Historical tenant for older demo years.'),
        ], $userId, $role);

        $currentYear = (int)(new \DateTimeImmutable('today'))->format('Y');
        $startDate = sprintf('%d-01-01', $currentYear - 4);
        $endDate = sprintf('%d-12-31', $currentYear - 2);

        $this->tenancyService->createTenancy([
            'unitId' => $unitId,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseRent' => '790',
            'serviceCharge' => '145',
            'deposit' => '1580',
            'conditions' => $this->l10n->t('Completed tenancy used for historical demo timelines.'),
            'partnerIds' => [$formerTenant->getId()],
        ], $userId, $role);
    }

    private function createDemoTask(int $unitId, string $userId): void {
        $dueDate = (new \DateTimeImmutable('+7 days'))->format('Y-m-d');
        $titles = [
            $this->l10n->t('Schedule gutter cleaning'),
            $this->l10n->t('Check smoke detectors'),
            $this->l10n->t('Review annual service contracts'),
            $this->l10n->t('Prepare tenant information letter'),
        ];
        $descriptions = [
            $this->l10n->t('Coordinate with vendors and confirm appointment windows.'),
            $this->l10n->t('Schedule the annual safety inspection for the unit.'),
            $this->l10n->t('Verify rates and renewal dates before approving next cycle.'),
            $this->l10n->t('Draft and send the yearly update to all tenants.'),
        ];
        $randomIndex = random_int(0, count($titles) - 1);

        $this->taskService->createTask(
            'unit',
            $unitId,
            $titles[$randomIndex],
            $descriptions[$randomIndex],
            $dueDate,
            $userId,
        );
    }

    private function startDemoYearEndProcess(int $unitId, string $userId): void {
        $template = $this->taskTemplateMapper->findByKey('year_end');
        if (!$template || $template->getId() === null) {
            return;
        }

        $lastClosedYear = (int)(new \DateTimeImmutable('today'))->format('Y') - 1;
        $this->workflowRunService->startWorkflowRun(
            'unit',
            $unitId,
            (int)$template->getId(),
            $lastClosedYear,
            $this->l10n->t('Year End %s', [$lastClosedYear]),
            $userId,
        );
    }

    private function createDemoBookings(string $userId, array $relation, int $unitId): void {
        $currentYear = (int)(new \DateTimeImmutable('today'))->format('Y');
        $years = [
            $currentYear - 4,
            $currentYear - 3,
            $currentYear - 2,
            $currentYear - 1,
            $currentYear,
        ];
        $bookings = [
            [
                'account' => 2000,
                'monthDay' => '01-15',
                'baseAmount' => 305.50,
                'description' => $this->l10n->t('Heating and water maintenance'),
            ],
            [
                'account' => 2100,
                'monthDay' => '02-10',
                'baseAmount' => 95.00,
                'description' => $this->l10n->t('Elevator service contract'),
            ],
            [
                'account' => 2200,
                'monthDay' => '03-05',
                'baseAmount' => 135.00,
                'description' => $this->l10n->t('Reserve fund contribution'),
            ],
            [
                'account' => 2300,
                'monthDay' => '04-08',
                'baseAmount' => 70.00,
                'description' => $this->l10n->t('Minor repairs and supplies'),
            ],
            [
                'account' => 2400,
                'monthDay' => '05-20',
                'baseAmount' => 225.00,
                'description' => $this->l10n->t('Quarterly property tax'),
            ],
            [
                'account' => 2600,
                'monthDay' => '06-12',
                'baseAmount' => 285.00,
                'description' => $this->l10n->t('Annual depreciation booking'),
            ],
            [
                'account' => 2700,
                'monthDay' => '07-18',
                'baseAmount' => 50.00,
                'description' => $this->l10n->t('Tax advisor fees'),
            ],
        ];

        foreach ($years as $yearIndex => $year) {
            foreach ($bookings as $booking) {
                $amount = (float)$booking['baseAmount'] + ($yearIndex * 5.0);
                $this->bookingService->createBooking(array_merge($relation, [
                    'account' => $booking['account'],
                    'date' => $year . '-' . $booking['monthDay'],
                    'amount' => number_format($amount, 2, '.', ''),
                    'description' => $booking['description'],
                ]), $userId);
            }

            if ($year < $currentYear) {
                $this->bookingYearService->closeYear($year, null, $unitId, $userId);
            }
        }
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

    private function createDemoActionLogs(string $userId, string $entityType, int $entityId, int $linkedEntityId, string $linkedEntityType = 'partner'): void {
        $entries = [
            [
                'type' => 'note',
                'title' => $this->l10n->t('Initial onboarding call completed'),
                'data' => $this->l10n->t('Walked through key contacts and the current maintenance backlog.'),
            ],
            [
                'type' => 'email',
                'title' => $this->l10n->t('Shared annual planning reminder'),
                'data' => $this->l10n->t('Sent timeline and responsibilities for the upcoming settlement period.'),
            ],
            [
                'type' => 'event',
                'title' => $this->l10n->t('Scheduled property walkthrough'),
                'data' => $this->l10n->t('Added an internal walkthrough appointment to validate open points.'),
            ],
            [
                'type' => 'call',
                'title' => $this->l10n->t('Follow-up call logged'),
                'data' => $this->l10n->t('Confirmed that all required documents are ready for processing.'),
            ],
        ];

        foreach ($entries as $entry) {
            $this->actionLogService->createManualEntry($userId, $entityType, $entityId, array_merge($entry, [
                'linkedEntityType' => $linkedEntityType,
                'linkedEntityId' => $linkedEntityId,
            ]));
        }
    }

    private function createDemoDocuments(string $userId, int $unitId): void {
        $documents = [
            [
                'fileName' => 'demo-document-1.txt',
                'title' => $this->l10n->t('Document #%s', [1]),
                'content' => $this->l10n->t('Document added.'),
            ],
            [
                'fileName' => 'demo-document-2.txt',
                'title' => $this->l10n->t('Document #%s', [2]),
                'content' => $this->l10n->t('Document linked.'),
            ],
        ];

        foreach ($documents as $document) {
            $this->documentService->createContentForTargets(
                $userId,
                [['entityType' => 'unit', 'entityId' => $unitId]],
                $document['fileName'],
                $document['content'],
                null,
                $document['title']
            );
        }
    }
}
