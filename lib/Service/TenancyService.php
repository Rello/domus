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
use OCP\IL10N;

class TenancyService {
    public function __construct(
        private TenancyMapper $tenancyMapper,
        private UnitMapper $unitMapper,
        private PartnerMapper $partnerMapper,
        private PartnerRelMapper $partnerRelMapper,
        private BookingMapper $bookingMapper,
        private ReportMapper $reportMapper,
        private IL10N $l10n,
    ) {
    }

    public function listTenancies(string $userId, ?int $unitId = null, ?int $partnerId = null): array {
        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        if ($partnerId !== null) {
            $tenancies = array_filter($tenancies, fn(Tenancy $tenancy) => in_array($partnerId, $tenancy->getPartnerIds() ?? [], true));
        }
        foreach ($tenancies as $tenancy) {
            $this->hydratePartners($tenancy, $userId);
            $tenancy->setStatus($this->getStatus($tenancy, new \DateTimeImmutable('today')));
            $this->hydrateUnit($tenancy, $userId);
            $this->hydrateDerivedFields($tenancy);
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
        $tenancy->setReports($this->reportMapper->findByUser($userId, null, null, $tenancy->getId()));
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
        $start = new \DateTimeImmutable($tenancy->getStartDate());
        $end = $tenancy->getEndDate() ? new \DateTimeImmutable($tenancy->getEndDate()) : null;
        if ($start > $today) {
            return 'future';
        }
        if ($end !== null && $end < $today) {
            return 'historical';
        }
        return 'active';
    }

    public function getTenanciesForUnit(int $unitId, string $userId): array {
        return $this->listTenancies($userId, $unitId, null);
    }

    public function getTenanciesForPartner(int $partnerId, string $userId): array {
        return $this->listTenancies($userId, null, $partnerId);
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
