<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PartnerRel;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\ReportMapper;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Service\ReportService;
use Psr\Log\LoggerInterface;
use OCP\IL10N;

class TenancyService {
    public function __construct(
        private TenancyMapper $tenancyMapper,
        private UnitMapper $unitMapper,
        private PartnerMapper $partnerMapper,
        private PartnerRelMapper $partnerRelMapper,
        private BookingMapper $bookingMapper,
        private ReportMapper $reportMapper,
        private ReportService $reportService,
        private LoggerInterface $logger,
        private IL10N $l10n,
    ) {
    }

    public function listTenancies(string $userId, ?int $unitId = null, ?int $partnerId = null): array {
        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        foreach ($tenancies as $tenancy) {
            $this->hydratePartners($tenancy, $userId);
            $tenancy->setStatus($this->getStatus($tenancy, new \DateTimeImmutable('today')));
            $this->hydrateUnit($tenancy, $userId);
            $this->hydrateDerivedFields($tenancy);
        }

        if ($partnerId !== null) {
            $tenancies = array_filter($tenancies, fn(Tenancy $tenancy) => in_array($partnerId, $tenancy->getPartnerIds() ?? [], true));
        }

        return array_values($tenancies);
    }

    public function getTenancyForUser(int $id, string $userId): Tenancy {
        $tenancy = $this->tenancyMapper->findForUser($id, $userId);
        if (!$tenancy) {
            throw new \RuntimeException($this->l10n->t('Tenancy not found.'));
        }
        $this->hydratePartners($tenancy, $userId);
        $tenancy->setStatus($this->getStatus($tenancy, new \DateTimeImmutable('today')));
        $this->hydrateUnit($tenancy, $userId);
        $this->hydrateDerivedFields($tenancy);
        $tenancy->setBookings($this->bookingMapper->findByUser($userId, ['tenancyId' => $tenancy->getId()]));
        $this->hydrateReports($tenancy, $userId);
        return $tenancy;
    }

    public function createTenancy(array $data, string $userId): Tenancy {
        $this->assertTenancyInput($data, $userId);
        $now = time();
        $tenancy = new Tenancy();
        $tenancy->setUserId($userId);
        $tenancy->setUnitId((int)$data['unitId']);
        $tenancy->setStartDate($data['startDate']);
        $tenancy->setEndDate($data['endDate'] ?? null);
        $tenancy->setBaseRent($data['baseRent']);
        $tenancy->setServiceCharge($data['serviceCharge'] ?? null);
        $tenancy->setServiceChargeAsPrepayment((int)($data['serviceChargeAsPrepayment'] ?? 0));
        $tenancy->setDeposit($data['deposit'] ?? null);
        $tenancy->setConditions($data['conditions'] ?? null);
        $tenancy->setCreatedAt($now);
        $tenancy->setUpdatedAt($now);

        $inserted = $this->tenancyMapper->insert($tenancy);
        $this->syncPartnerRelations($inserted, $data['partnerIds'] ?? [], $userId);
        $this->hydratePartners($inserted, $userId);
        return $inserted;
    }

    public function updateTenancy(int $id, array $data, string $userId): Tenancy {
        $tenancy = $this->getTenancyForUser($id, $userId);
        $this->assertTenancyInput($data + ['unitId' => $tenancy->getUnitId(), 'partnerIds' => $data['partnerIds'] ?? []], $userId);
        foreach (['unitId', 'startDate', 'endDate', 'baseRent', 'serviceCharge', 'serviceChargeAsPrepayment', 'deposit', 'conditions'] as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $tenancy->$setter($data[$field] !== '' ? $data[$field] : null);
            }
        }
        $tenancy->setUpdatedAt(time());
        $updated = $this->tenancyMapper->update($tenancy);
        if (isset($data['partnerIds'])) {
            $this->syncPartnerRelations($updated, $data['partnerIds'], $userId);
        }
        $this->hydratePartners($updated, $userId);
        return $updated;
    }

    public function deleteTenancy(int $id, string $userId): void {
        $tenancy = $this->getTenancyForUser($id, $userId);
        $this->partnerRelMapper->deleteForRelation('tenancy', $tenancy->getId(), $userId);
        $this->tenancyMapper->delete($tenancy);
    }

    public function getStatus(Tenancy $tenancy, \DateTimeImmutable $today): string {
        $start = $this->parseDate($tenancy->getStartDate());
        $end = $this->parseDate($tenancy->getEndDate());

        if ($start !== null && $start > $today) {
            return 'future';
        }
        if ($end !== null && $end < $today) {
            return 'historical';
        }
        return 'active';
    }

    private function parseDate(?string $value): ?\DateTimeImmutable {
        if (!$value) {
            return null;
        }

        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception $e) {
            return null;
        }
    }

    public function getTenanciesForUnit(int $unitId, string $userId): array {
        return $this->listTenancies($userId, $unitId, null);
    }

    public function getTenanciesForPartner(int $partnerId, string $userId): array {
        return $this->listTenancies($userId, null, $partnerId);
    }

    public function sumTenancyForYear(string $userId, int $unitId, int $year): array {
        $this->logger->info('TenancyService: calculating tenancy sums for year', [
            'unitId' => $unitId,
            'userId' => $userId,
            'year' => $year,
        ]);

        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        $this->logger->info('TenancyService: tenancies fetched for unit', [
            'count' => count($tenancies),
        ]);

        $startOfYear = new \DateTimeImmutable(sprintf('%d-01-01', $year));
        $endOfYear = new \DateTimeImmutable(sprintf('%d-12-31', $year));
        $sums = ['1000' => 0.0, '1001' => 0.0];

        foreach ($tenancies as $tenancy) {
            $startDate = $this->parseDate($tenancy->getStartDate());
            if ($startDate === null) {
                $this->logger->info('TenancyService: skipping tenancy with invalid start date', [
                    'tenancyId' => $tenancy->getId(),
                ]);
                continue;
            }

            $endDate = $this->parseDate($tenancy->getEndDate()) ?? $endOfYear;

            $periodStart = $startDate > $startOfYear ? $startDate : $startOfYear;
            $periodEnd = $endDate < $endOfYear ? $endDate : $endOfYear;

            if ($periodEnd < $periodStart) {
                $this->logger->info('TenancyService: tenancy does not intersect with year', [
                    'tenancyId' => $tenancy->getId(),
                    'periodStart' => $periodStart->format('Y-m-d'),
                    'periodEnd' => $periodEnd->format('Y-m-d'),
                ]);
                continue;
            }

            $months = ($periodEnd->format('Y') - $periodStart->format('Y')) * 12
                + ($periodEnd->format('n') - $periodStart->format('n')) + 1;

            $sums['1000'] += $months * (float)$tenancy->getBaseRent();
            $sums['1001'] += $months * (float)($tenancy->getServiceCharge() ?? 0.0);

            $this->logger->info('TenancyService: tenancy contribution calculated', [
                'tenancyId' => $tenancy->getId(),
                'months' => $months,
                'baseRent' => $tenancy->getBaseRent(),
                'serviceCharge' => $tenancy->getServiceCharge(),
                'sums' => $sums,
            ]);
        }

        $this->logger->info('TenancyService: calculated tenancy sums for year', ['sums' => $sums]);

        return $sums;
    }

    private function assertTenancyInput(array $data, string $userId): void {
        if (!isset($data['unitId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Unit is required.'));
        }
        if (!isset($data['startDate']) || !preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', (string)$data['startDate'])) {
            throw new \InvalidArgumentException($this->l10n->t('Start date is required.'));
        }
        if (!isset($data['baseRent'])) {
            throw new \InvalidArgumentException($this->l10n->t('Base rent is required.'));
        }
        $unit = $this->unitMapper->findForUser((int)$data['unitId'], $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        if (isset($data['partnerIds'])) {
            foreach ($data['partnerIds'] as $partnerId) {
                $partner = $this->partnerMapper->findForUser((int)$partnerId, $userId);
                if (!$partner) {
                    throw new \RuntimeException($this->l10n->t('Partner not found.'));
                }
            }
        }
    }

    private function syncPartnerRelations(Tenancy $tenancy, array $partnerIds, string $userId): void {
        $this->partnerRelMapper->deleteForRelation('tenancy', $tenancy->getId(), $userId);
        foreach ($partnerIds as $partnerId) {
            $relation = new PartnerRel();
            $relation->setUserId($userId);
            $relation->setType('tenancy');
            $relation->setRelationId($tenancy->getId());
            $relation->setPartnerId((int)$partnerId);
            $this->partnerRelMapper->insert($relation);
        }
        $tenancy->setPartnerIds($partnerIds);
    }

    private function hydratePartners(Tenancy $tenancy, string $userId): void {
        $relations = $this->partnerRelMapper->findForTenancy($tenancy->getId(), $userId);
        $partnerIds = [];
        $partners = [];
        foreach ($relations as $relation) {
            $partnerIds[] = $relation->getPartnerId();
            $partner = $this->partnerMapper->findForUser($relation->getPartnerId(), $userId);
            if ($partner) {
                $partners[] = $partner;
            }
        }
        $tenancy->setPartnerIds($partnerIds);
        $tenancy->setPartners($partners);
    }

    private function hydrateUnit(Tenancy $tenancy, string $userId): void {
        $unit = $this->unitMapper->findForUser($tenancy->getUnitId(), $userId);
        if ($unit) {
            $tenancy->setUnitLabel($unit->getLabel());
        }
    }

    private function hydrateReports(Tenancy $tenancy, string $userId): void {
        $reports = $this->reportMapper->findByUser($userId, null, null, $tenancy->getId());
        foreach ($reports as $report) {
            $report->setDownloadUrl($this->reportService->getDownloadUrl($report, $userId));
        }
        $tenancy->setReports($reports);
    }

    private function hydrateDerivedFields(Tenancy $tenancy): void {
        $start = $tenancy->getStartDate();
        $end = $tenancy->getEndDate();
        $period = $start ? $start . ' – ' . ($end ?: $this->l10n->t('open')) : null;
        $tenancy->setPeriod($period);
        $partners = $tenancy->getPartners();
        if (!empty($partners)) {
            $tenancy->setPartnerName($partners[0]->getName());
        }
    }
}
