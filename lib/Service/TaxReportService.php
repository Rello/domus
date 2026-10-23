<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

/** Wiso overview using existing tenancy amounts and unit-level bookings. */
class TaxReportService {
    public function __construct(
        private UnitMapper $unitMapper,
        private BookingService $bookingService,
        private TenancyService $tenancyService,
        private BookingYearService $bookingYearService,
        private AccountService $accountService,
        private ServiceChargeSettlementService $settlements,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
    }

    public function report(string $userId, int $year, string $role): array {
        if ($year < 1900 || $year > 9999) throw new \InvalidArgumentException($this->l10n->t('Invalid year.'));
        $management = $this->permissionService->isBuildingManagement($role);
        $units = $this->unitMapper->findByUser($userId, null, !$management);
        $unitIds = array_map(static fn($unit) => $unit->getId(), $units);
        $unitSet = array_fill_keys($unitIds, true);
        $bookings = [];
        $topAccounts = $this->accountService->getTopAccountNumberMap();
        $years = [$year => true, (int)date('Y') => true, (int)date('Y') - 1 => true];
        if ($units !== []) {
            foreach ($this->bookingService->sumByAccountGrouped($userId, null, 'unit') as $row) {
                $unitId = (int)($row['unit_id'] ?? 0);
                if (!isset($unitSet[$unitId])) continue;
                $bookingYear = (int)$row['year'];
                $years[$bookingYear] = true;
                if ($bookingYear === $year) {
                    $number = $this->accountService->resolveTopAccountNumber((string)$row['account'], $topAccounts);
                    $bookings[$unitId][$number] = ($bookings[$unitId][$number] ?? 0.0) + (float)$row['total'];
                }
            }
        }
        $tenancies = $units === [] ? [] : array_intersect_key($this->tenancyService->listTenanciesByUnit($userId), $unitSet);
        foreach ($tenancies as $items) {
            foreach ($items as $tenancy) {
                $start = InputValidation::date($tenancy->getStartDate());
                $end = InputValidation::date($tenancy->getEndDate());
                if ($start === null) continue;
                for ($y = (int)$start->format('Y'); $y <= ($end ? (int)$end->format('Y') : (int)date('Y')); $y++) $years[$y] = true;
            }
        }
        $closedUnits = $this->bookingYearService->getClosedYearsForUnits($unitIds);
        $propertyIds = array_values(array_unique(array_filter(array_map(static fn($unit) => $unit->getPropertyId(), $units))));
        $closedProperties = $this->bookingYearService->getClosedYearsForProperties($propertyIds);
        foreach ([$closedUnits, $closedProperties] as $closures) {
            foreach ($closures as $items) foreach (array_keys($items) as $closedYear) $years[$closedYear] = true;
        }
        $otherCostBookings = [];
        if ($units !== []) {
            foreach ($this->bookingService->listBookings($userId, ['year' => $year]) as $booking) {
                $unitId = $booking->getUnitId();
                $account = $this->accountService->resolveTopAccountNumber((string)$booking->getAccount(), $topAccounts);
                if (!isset($unitSet[$unitId]) || !in_array($account, ['2300', '2700'], true)) continue;
                $otherCostBookings[$unitId][] = [
                    'description' => $booking->getDescription() ?? '',
                    'amount' => round((float)$booking->getAmount(), 2),
                ];
            }
        }
        $defaults = ['depreciation' => ['2600'], 'interest' => ['2500'], 'nonAllocable' => ['2100'],
            'otherCosts' => ['2300', '2700'], 'allocable' => ['2000'], 'propertyTax' => ['2400']];
        $columns = [];
        foreach ($units as $unit) {
            $id = $unit->getId();
            $rent = $this->tenancyService->sumTenanciesForYear($tenancies[$id] ?? [], $year);
            $amounts = ['rent' => round((float)($rent['1000'] ?? 0.0), 2), 'prepayments' => round((float)($rent['1001'] ?? 0.0), 2)];
            foreach ($defaults as $field => $numbers) {
                $amounts[$field] = round(array_sum(array_map(static fn($number) => $bookings[$id][$topAccounts[$number] ?? $number] ?? 0.0, $numbers)), 2);
            }
            $amounts['tenantPayment'] = 0.0;
            $amounts['tenantCredit'] = 0.0;
            foreach ($this->settlements->listForUnit($userId, $id, $year) as $settlement) {
                $balance = round((float)$settlement['saldo'], 2);
                if ($balance < 0) $amounts['tenantPayment'] -= $balance;
                else $amounts['tenantCredit'] += $balance;
            }
            $amounts['tenantPayment'] = round($amounts['tenantPayment'], 2);
            $amounts['tenantCredit'] = round($amounts['tenantCredit'], 2);
            $amounts['totalIncome'] = round($amounts['rent'] + $amounts['prepayments'] + $amounts['tenantPayment'] - $amounts['tenantCredit'], 2);
            $amounts['totalOperatingExpenses'] = round(array_sum(array_intersect_key($amounts,
                array_flip(['interest', 'nonAllocable', 'otherCosts', 'allocable', 'propertyTax']))), 2);
            $amounts['controlBalance'] = round($amounts['totalIncome'] - $amounts['depreciation'] - $amounts['totalOperatingExpenses'], 2);
            $closed = isset($closedUnits[$id][$year]) || isset($closedProperties[$unit->getPropertyId()][$year]);
            $columns[] = ['unitId' => $id, 'label' => $unit->getLabel(), 'closed' => $closed, 'amounts' => $amounts, 'otherCostBookings' => $otherCostBookings[$id] ?? []];
        }
        $years = array_keys($years);
        rsort($years, SORT_NUMERIC);
        return ['year' => $year, 'years' => $years, 'units' => $columns];
    }
}
