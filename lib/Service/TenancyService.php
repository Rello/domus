<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PartnerRel;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class TenancyService {
    public function __construct(
        private TenancyMapper $tenancyMapper,
        private UnitMapper $unitMapper,
        private PartnerMapper $partnerMapper,
        private PartnerRelMapper $partnerRelMapper,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
    }

    public function listTenancies(string $userId, ?int $unitId = null, ?int $partnerId = null): array {
        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        if ($tenancies === []) {
            return [];
        }
        $relationsByTenancy = [];
        $partnerIds = [];
        $tenancyIds = array_map(fn(Tenancy $tenancy) => $tenancy->getId(), $tenancies);
        foreach ($this->partnerRelMapper->findForTenancies($tenancyIds, $userId) as $relation) {
            $relationsByTenancy[$relation->getRelationId()][] = $relation->getPartnerId();
            $partnerIds[] = $relation->getPartnerId();
        }
        $partnersById = [];
        foreach ($this->partnerMapper->findForUserByIds($partnerIds, $userId) as $partner) {
            $partnersById[$partner->getId()] = $partner;
        }
        $unitsById = [];
        $unitIds = array_map(fn(Tenancy $tenancy) => $tenancy->getUnitId(), $tenancies);
        foreach ($this->unitMapper->findForUserByIds($unitIds, $userId) as $unit) {
            $unitsById[$unit->getId()] = $unit;
        }
        $today = new \DateTimeImmutable('today');
        foreach ($tenancies as $tenancy) {
            $ids = array_values(array_unique($relationsByTenancy[$tenancy->getId()] ?? []));
            $tenancy->setPartnerIds($ids);
            $partners = [];
            foreach ($ids as $id) {
                if (isset($partnersById[$id])) {
                    $partners[] = $partnersById[$id];
                }
            }
            $tenancy->setPartners($partners);
            $tenancy->setStatus($this->getStatus($tenancy, $today));
            $tenancy->setUnitLabel(($unitsById[$tenancy->getUnitId()] ?? null)?->getLabel());
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
        return $tenancy;
    }

    public function createTenancy(array $data, string $userId, string $role): Tenancy {
        $data = $this->permissionService->guardTenancyFinancialFields($role, $data);
        $this->assertTenancyInput($data, $userId, $role);
        $startDate = $this->parseDate($data['startDate'] ?? null);
        if ($startDate === null) {
            throw new \InvalidArgumentException($this->l10n->t('Start date is required.'));
        }

        $this->closeOpenTenanciesForUnit((int)$data['unitId'], $startDate, $userId);

        $now = time();
        $tenancy = new Tenancy();
        $tenancy->setUserId($userId);
        $tenancy->setUnitId((int)$data['unitId']);
        $tenancy->setStartDate($data['startDate']);
        $tenancy->setEndDate($data['endDate'] ?? null);
        $tenancy->setBaseRent($data['baseRent']);
        $tenancy->setServiceCharge($data['serviceCharge'] ?? null);
        $tenancy->setDeposit($data['deposit'] ?? null);
        $tenancy->setConditions($data['conditions'] ?? null);
        $tenancy->setCreatedAt($now);
        $tenancy->setUpdatedAt($now);

        $inserted = $this->tenancyMapper->insert($tenancy);
        $this->syncPartnerRelations($inserted, $data['partnerIds'] ?? [], $userId, $role);
        $this->hydratePartners($inserted, $userId);
        return $inserted;
    }

    public function changeConditions(int $id, array $data, string $userId, string $role): Tenancy {
        $existing = $this->getTenancyForUser($id, $userId);

        $mergedData = [
            'unitId' => $existing->getUnitId(),
            'startDate' => $data['startDate'] ?? null,
            'endDate' => $data['endDate'] ?? null,
            'baseRent' => $data['baseRent'] ?? null,
            'serviceCharge' => $data['serviceCharge'] ?? null,
            'deposit' => $data['deposit'] ?? null,
            'conditions' => $data['conditions'] ?? null,
            'partnerIds' => $data['partnerIds'] ?? $existing->getPartnerIds(),
        ];

        $mergedData = $this->permissionService->guardTenancyFinancialFields($role, $mergedData);
        $this->assertTenancyInput($mergedData, $userId, $role);
        $startDate = $this->parseDate($mergedData['startDate'] ?? null);

        if ($startDate === null) {
            throw new \InvalidArgumentException($this->l10n->t('Start date is required.'));
        }

        $this->closeOverlappingTenancies($existing, $mergedData['partnerIds'], $startDate, $userId);

        return $this->createTenancy($mergedData, $userId, $role);
    }

    public function updateTenancy(int $id, array $data, string $userId, string $role): Tenancy {
        $tenancy = $this->getTenancyForUser($id, $userId);
        $data = $this->permissionService->guardTenancyFinancialFields($role, $data);
        $this->assertTenancyInput($data + ['unitId' => $tenancy->getUnitId(), 'partnerIds' => $data['partnerIds'] ?? []], $userId, $role);
        foreach (['unitId', 'startDate', 'endDate', 'baseRent', 'serviceCharge', 'deposit', 'conditions'] as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $tenancy->$setter($data[$field] !== '' ? $data[$field] : null);
            }
        }
        $tenancy->setUpdatedAt(time());
        $updated = $this->tenancyMapper->update($tenancy);
        if (isset($data['partnerIds'])) {
            $this->syncPartnerRelations($updated, $data['partnerIds'], $userId, $role);
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
        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        $startOfYear = new \DateTimeImmutable(sprintf('%d-01-01', $year));
        $endOfYear = new \DateTimeImmutable(sprintf('%d-12-31', $year));
        $sums = ['1000' => 0.0, '1001' => 0.0];

        foreach ($tenancies as $tenancy) {
            $startDate = $this->parseDate($tenancy->getStartDate());
            if ($startDate === null) {
                continue;
            }

            $endDate = $this->parseDate($tenancy->getEndDate()) ?? $endOfYear;

            $periodStart = $startDate > $startOfYear ? $startDate : $startOfYear;
            $periodEnd = $endDate < $endOfYear ? $endDate : $endOfYear;

            if ($periodEnd < $periodStart) {
                continue;
            }

            // Prorate each partial month by its actual calendar days, inclusive of both dates.
            $months = 0.0;
            for ($month = $periodStart->modify('first day of this month'); $month <= $periodEnd; $month = $month->modify('+1 month')) {
                $from = max($periodStart, $month);
                $to = min($periodEnd, $month->modify('last day of this month'));
                $months += ($from->diff($to)->days + 1) / (int)$month->format('t');
            }

            $sums['1000'] += $months * (float)$tenancy->getBaseRent();
            $sums['1001'] += $months * (float)($tenancy->getServiceCharge() ?? 0.0);
        }

        return $sums;
    }

    private function assertTenancyInput(array $data, string $userId, string $role): void {
        if (!isset($data['unitId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Unit is required.'));
        }
        if (!isset($data['startDate']) || !preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', (string)$data['startDate'])) {
            throw new \InvalidArgumentException($this->l10n->t('Start date is required.'));
        }
        if (!isset($data['baseRent']) && !$this->permissionService->isBuildingManagement($role)) {
            throw new \InvalidArgumentException($this->l10n->t('Base rent is required.'));
        }
        $unit = $this->unitMapper->findForUser((int)$data['unitId'], $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        if ($this->permissionService->isBuildingManagement($role) && $unit->getPropertyId() === null) {
            throw new \InvalidArgumentException($this->l10n->t('Property is required for building management tenancies.'));
        }
        if (isset($data['partnerIds'])) {
            foreach ($data['partnerIds'] as $partnerId) {
                $partner = $this->partnerMapper->findForUser((int)$partnerId, $userId);
                if (!$partner) {
                    throw new \RuntimeException($this->l10n->t('Partner not found.'));
                }
                $this->permissionService->assertPartnerMatchesRole($role, $partner->getPartnerType());
            }
        }
    }

    private function syncPartnerRelations(Tenancy $tenancy, array $partnerIds, string $userId, string $role): void {
        $this->partnerRelMapper->deleteForRelation('tenancy', $tenancy->getId(), $userId);
        foreach ($partnerIds as $partnerId) {
            $partner = $this->partnerMapper->findForUser((int)$partnerId, $userId);
            if ($partner) {
                $this->permissionService->assertPartnerMatchesRole($role, $partner->getPartnerType());
            }
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
        $partnerIds = array_values(array_unique(array_map(fn(PartnerRel $relation) => $relation->getPartnerId(), $relations)));

        $partnersById = [];
        foreach ($this->partnerMapper->findForUserByIds($partnerIds, $userId) as $partner) {
            $partnersById[$partner->getId()] = $partner;
        }

        $partners = [];
        foreach ($partnerIds as $partnerId) {
            if (isset($partnersById[$partnerId])) {
                $partners[] = $partnersById[$partnerId];
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

    private function closeOverlappingTenancies(Tenancy $reference, array $partnerIds, \DateTimeImmutable $newStartDate, string $userId): void {
        $tenancies = $this->tenancyMapper->findByUser($userId, $reference->getUnitId());
        $newEndDate = $newStartDate->modify('-1 day');

        foreach ($tenancies as $tenancy) {
            $relations = $this->partnerRelMapper->findForTenancy($tenancy->getId(), $userId);
            $tenancyPartnerIds = array_map(fn(PartnerRel $relation) => $relation->getPartnerId(), $relations);

            if (empty(array_intersect($partnerIds, $tenancyPartnerIds))) {
                continue;
            }

            $existingStart = $this->parseDate($tenancy->getStartDate());
            if ($existingStart === null || $existingStart > $newStartDate) {
                continue;
            }

            $existingEnd = $this->parseDate($tenancy->getEndDate());
            if ($existingEnd !== null && $existingEnd < $newStartDate) {
                continue;
            }

            $tenancy->setEndDate($newEndDate->format('Y-m-d'));
            $tenancy->setUpdatedAt(time());
            $this->tenancyMapper->update($tenancy);
        }
    }

    private function closeOpenTenanciesForUnit(int $unitId, \DateTimeImmutable $newStartDate, string $userId): void {
        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        $newEndDate = $newStartDate->modify('-1 day');

        foreach ($tenancies as $tenancy) {
            if ($tenancy->getEndDate() !== null) {
                continue;
            }

            $existingStart = $this->parseDate($tenancy->getStartDate());
            if ($existingStart === null || $existingStart >= $newStartDate) {
                continue;
            }

            $tenancy->setEndDate($newEndDate->format('Y-m-d'));
            $tenancy->setUpdatedAt(time());
            $this->tenancyMapper->update($tenancy);
        }
    }
}
