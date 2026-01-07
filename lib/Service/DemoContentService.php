<?php

namespace OCA\Domus\Service;

use OCP\IDBConnection;
use OCP\IL10N;

class DemoContentService {
    public function __construct(
        private UnitService $unitService,
        private PartnerService $partnerService,
        private TenancyService $tenancyService,
        private PartnerRelationService $partnerRelationService,
        private TaskService $taskService,
        private BookingService $bookingService,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    public function createDemoContent(string $userId, string $role): array {
        $this->connection->beginTransaction();

        try {
            $unit = $this->unitService->createUnit([
                'label' => $this->l10n->t('Demo apartment'),
                'unitNumber' => 'A-101',
                'livingArea' => '72',
                'unitType' => $this->l10n->t('Apartment'),
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

            $dueDate = (new \DateTimeImmutable('+14 days'))->format('Y-m-d');
            $this->taskService->createTask(
                $unit->getId(),
                $this->l10n->t('Check smoke detectors'),
                $this->l10n->t('Schedule the annual safety inspection for the unit.'),
                $dueDate,
                $userId,
            );

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
                $this->bookingService->createBooking(array_merge($booking, [
                    'unitId' => $unit->getId(),
                ]), $userId);
            }

            $this->connection->commit();

            return [
                'unitId' => $unit->getId(),
                'tenantId' => $tenant->getId(),
                'facilitiesId' => $facilities->getId(),
            ];
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

}
