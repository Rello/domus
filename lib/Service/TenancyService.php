<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Db\Unit;
use OCA\Domus\Accounting\TenancyPeriod;
use OCA\Domus\Exception\ResourceNotFoundException;
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
        private ?AuditService $audit = null,
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
            $unit = $unitsById[$tenancy->getUnitId()] ?? null;
            $tenancy->setUnitLabel($unit?->getLabel());
            $tenancy->setUnitStreet($unit?->getStreet());
            $tenancy->setUnitCity($unit?->getCity());
            $tenancy->setUnitLivingArea($unit?->getLivingArea());
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
            throw new ResourceNotFoundException($this->l10n->t('Tenancy not found.'));
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
        $this->audit?->relationships($inserted->getId(), $userId, $inserted->getTeamId(), null, $inserted->getUnitId(), [], $inserted->getPartnerIds() ?? []);
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
        $oldUnitId = $tenancy->getUnitId();
        $oldPartners = $tenancy->getPartnerIds() ?? [];
        $data = $this->permissionService->guardTenancyFinancialFields($role, $data);
        $this->assertTenancyInput(array_merge($tenancy->jsonSerialize(), $data), $userId, $role);
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
        $this->audit?->relationships($id, $userId, $updated->getTeamId(), $oldUnitId, $updated->getUnitId(), $oldPartners, $updated->getPartnerIds() ?? []);
        $this->hydratePartners($updated, $userId);
        return $updated;
    }

    public function deleteTenancy(int $id, string $userId): void {
        $tenancy = $this->getTenancyForUser($id, $userId);
        $this->partnerRelMapper->deleteForRelation('tenancy', $tenancy->getId(), $userId);
        $this->tenancyMapper->delete($tenancy);
        $this->audit?->record('tenancy.deleted', $id, $userId, $tenancy->getTeamId(), ['partnerRelations' => count($tenancy->getPartnerIds() ?? [])]);
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
        return InputValidation::date($value);
    }

    /** Hydrate once and index for collection consumers. */
    public function listTenanciesByUnit(string $userId): array {
        $byUnit = [];
        foreach ($this->listTenancies($userId) as $tenancy) {
            $byUnit[$tenancy->getUnitId()][] = $tenancy;
        }
        return $byUnit;
    }

    public function enrichUnitTenancies(Unit $unit, array $tenancies): void {
        $groups = ['active' => [], 'future' => [], 'historical' => []];
        $today = new \DateTimeImmutable('today');
        foreach ($tenancies as $tenancy) {
            $groups[$this->getStatus($tenancy, $today)][] = $tenancy;
        }
        usort($groups['active'], static fn(Tenancy $a, Tenancy $b) => strcmp($b->getStartDate(), $a->getStartDate()));
        $unit->setActiveTenancies($groups['active']);
        $unit->setFutureTenancies($groups['future']);
        $unit->setHistoricTenancies($groups['historical']);
        $unit->setCurrentTenancy($groups['active'][0] ?? null);
    }

    public function getTenanciesForUnit(int $unitId, string $userId): array {
        return $this->listTenancies($userId, $unitId, null);
    }

    public function getTenanciesForPartner(int $partnerId, string $userId): array {
        return $this->listTenancies($userId, null, $partnerId);
    }

    public function sumTenancyForYear(string $userId, int $unitId, int $year): array {
        return $this->sumTenanciesForYear($this->tenancyMapper->findByUser($userId, $unitId), $year);
    }

    public function sumTenanciesForYear(array $tenancies, int $year): array {
        $sums = ['1000' => 0.0, '1001' => 0.0];
        foreach ($tenancies as $tenancy) {
            $months = TenancyPeriod::monthsWithinYear($tenancy->getStartDate(), $tenancy->getEndDate(), $year);
            $sums['1000'] += $months * (float)$tenancy->getBaseRent();
            $sums['1001'] += $months * (float)($tenancy->getServiceCharge() ?? 0.0);
        }
        return $sums;
    }

    private function assertTenancyInput(array $data, string $userId, string $role): void {
        if (!isset($data['unitId'])) {
            throw new \InvalidArgumentException($this->l10n->t('Unit is required.'));
        }
        InputValidation::assertDate($data['startDate'] ?? null, $this->l10n->t('Start date is required.'));
        if (isset($data['endDate']) && $data['endDate'] !== '') {
            InputValidation::assertPeriod($data['startDate'], $data['endDate'], $this->l10n->t('Invalid period definition.'));
        }
        foreach (['baseRent', 'serviceCharge', 'deposit'] as $field) {
            $required = $field === 'baseRent' && !$this->permissionService->isBuildingManagement($role);
            if ($required || (isset($data[$field]) && $data[$field] !== '')) {
                InputValidation::assertMoney($data[$field] ?? null, $this->l10n->t('Amount must be a non-negative monetary value.'));
            }
        }
        $unit = $this->unitMapper->findForUser((int)$data['unitId'], $userId);
        if (!$unit) {
            throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
        }
        if ($this->permissionService->isBuildingManagement($role) && $unit->getPropertyId() === null) {
            throw new \InvalidArgumentException($this->l10n->t('Property is required for building management tenancies.'));
        }
        if (isset($data['partnerIds'])) {
            foreach ($data['partnerIds'] as $partnerId) {
                $partner = $this->partnerMapper->findForUser((int)$partnerId, $userId);
                if (!$partner) {
                    throw new ResourceNotFoundException($this->l10n->t('Partner not found.'));
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
            $tenancy->setUnitStreet($unit->getStreet());
            $tenancy->setUnitCity($unit->getCity());
            $tenancy->setUnitLivingArea($unit->getLivingArea());
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
