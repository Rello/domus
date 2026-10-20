<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Exception\ResourceNotFoundException;
use OCA\Domus\Accounting\StatisticCalculations;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class StatisticsService {
        public function __construct(
                private BookingService $bookingService,
                private BookingYearService $bookingYearService,
                private TenancyService $tenancyService,
                private UnitMapper $unitMapper,
                private PermissionService $permissionService,
                private EntityImageService $entityImageService,
                private AccountService $accountService,
                private IL10N $l10n,
                private LoggerInterface $logger,
                private PortfolioSettingsService $portfolioSettings,
        ) {
        }

        public function unitStatPerYear(int $unitId, string $userId, int $year): array {
                $unit = $this->loadUnit($unitId, $userId);
                $topAccountMap = $this->accountService->getTopAccountNumberMap();
                $closedUnitYears = $this->bookingYearService->getClosedYearsForUnits([$unitId]);
                $propertyId = $unit?->getPropertyId();
                $closedPropertyYears = $propertyId ? $this->bookingYearService->getClosedYearsForProperties([$propertyId]) : [];

                $definitions = [
                        'revenue' => $this->normalizeColumns(StatisticCalculations::unitRevenue()),
                        'cost' => $this->normalizeColumns(StatisticCalculations::unitCost()),
                ];

                $tenancies = $this->tenancyService->getTenanciesForUnit($unitId, $userId);
                $grouped = $this->bookingService->sumByAccountGrouped($userId, $year, 'unit', $unitId);
                $sums = $this->buildUnitYearSums($unit, $this->getTaxRateSetting($userId), $year, $topAccountMap, $tenancies, $grouped);
                return $this->buildStatisticsTables($definitions, function (array $tableDefinitions) use ($unitId, $unit, $year, $sums, $topAccountMap, $closedUnitYears, $closedPropertyYears, $propertyId) {
                        $row = $this->buildRowForYear($year, $tableDefinitions, $sums, ['unit' => $unit], $topAccountMap);
                        $row['isProvisional'] = !$this->isYearClosed($year, $unitId, $propertyId, $closedUnitYears, $closedPropertyYears);
                        return $row;
                });
        }

        public function unitStatsAllYears(int $unitId, string $userId, ?array $columns = null): array {
                $unit = $this->loadUnit($unitId, $userId);
                $topAccountMap = $this->accountService->getTopAccountNumberMap();
                $closedUnitYears = $this->bookingYearService->getClosedYearsForUnits([$unitId]);
                $propertyId = $unit?->getPropertyId();
                $closedPropertyYears = $propertyId ? $this->bookingYearService->getClosedYearsForProperties([$propertyId]) : [];

                $definitions = [
                        'revenue' => $this->normalizeColumns(StatisticCalculations::unitRevenue()),
                        'cost' => $this->normalizeColumns(StatisticCalculations::unitCost()),
                ];

                $grouped = $this->bookingService->sumByAccountGrouped($userId, null, 'unit', $unitId);
                $perYearSums = $this->mapSumsByYear($grouped, $topAccountMap);
                $tenancies = $this->tenancyService->getTenanciesForUnit($unitId, $userId);
                $years = $this->collectYears($perYearSums, $tenancies);

                $tables = $this->initializeStatisticsTables($definitions);
                $taxRate = $this->getTaxRateSetting($userId);
                foreach ($years as $year) {
                        $tenancySums = $this->mapSumsToTopAccounts(
                                $this->tenancyService->sumTenanciesForYear($tenancies, $year),
                                $topAccountMap,
                        );
                        $unitSums = $this->mapSumsToTopAccounts($this->buildUnitSums($unit), $topAccountMap);
                        $sums = $this->mergeSums($perYearSums[$year] ?? [], $tenancySums, $unitSums);
                        $sums = $this->applyTaxRate($sums, $taxRate);

                        foreach ($definitions as $tableName => $tableDefinitions) {
                                $tables[$tableName]['rows'][] = $this->buildRowForYear(
                                        $year,
                                        $tableDefinitions,
                                        $sums,
                                        ['unit' => $unit],
                                        $topAccountMap,
                                );
                                $rowIndex = count($tables[$tableName]['rows']) - 1;
                                $tables[$tableName]['rows'][$rowIndex]['isProvisional'] = !$this->isYearClosed(
                                        $year,
                                        $unitId,
                                        $propertyId,
                                        $closedUnitYears,
                                        $closedPropertyYears,
                                );
                        }
                }

                return $tables;
        }

        public function unitOverview(int $year, string $userId, ?int $propertyId = null, string $role = 'landlord'): array {
                $definitions = StatisticCalculations::unitOverview();
                if ($this->permissionService->isLandlord($role)) {
                        array_splice($definitions, 2, 0, [[
                                'key' => 'occupancyStatus',
                                'label' => 'Occupancy',
                                'format' => 'occupancy',
                        ]]);
                }
                $definitions = $this->normalizeColumns($definitions);
                $topAccountMap = $this->accountService->getTopAccountNumberMap();
                $isBuildingManagement = $this->permissionService->isBuildingManagement($role);
                $propertyFilter = $isBuildingManagement ? $propertyId : null;
                $units = $this->unitMapper->findByUser($userId, $propertyFilter, !$isBuildingManagement);
                $unitIds = array_values(array_filter(array_map(static fn(Unit $unit) => $unit->getId(), $units)));
                $propertyIds = array_values(array_unique(array_filter(array_map(static fn(Unit $unit) => $unit->getPropertyId(), $units))));
                $closedUnitYears = $this->bookingYearService->getClosedYearsForUnits($unitIds);
                $closedPropertyYears = $this->bookingYearService->getClosedYearsForProperties($propertyIds);
                $rows = [];
                $tenanciesByUnit = $units === [] ? [] : $this->tenancyService->listTenanciesByUnit($userId);
                $bookingsByUnitYear = [];
                if ($units !== []) {
                        foreach ($this->bookingService->sumByAccountGrouped($userId, null, 'unit') as $bookingSum) {
                                $bookingsByUnitYear[(int)$bookingSum['unit_id']][(int)$bookingSum['year']][] = $bookingSum;
                        }
                }

                $taxRate = null;
                foreach ($units as $unit) {
                        $this->entityImageService->enrichUnit($unit);
                        $unitId = $unit->getId();
                        $unitPropertyId = $unit->getPropertyId();
                        $latestClosedYear = $this->getLatestClosedYearForUnit($unitId, $unitPropertyId, $closedUnitYears, $closedPropertyYears);
                        if ($latestClosedYear !== null) {
                                $sums = $this->buildUnitYearSums($unit, $taxRate ??= $this->getTaxRateSetting($userId), $latestClosedYear, $topAccountMap, $tenanciesByUnit[$unitId] ?? [], $bookingsByUnitYear[$unitId][$latestClosedYear] ?? []);
                                $row = $this->buildRowForYear($latestClosedYear, $definitions, $sums, ['unit' => $unit], $topAccountMap);
                                $row['isProvisional'] = false;
                        } else {
                                $row = $this->buildEmptyStatisticsRowForUnit($unit, $definitions);
                                $row['isProvisional'] = true;
                        }

                        if ($this->permissionService->isLandlord($role)) {
                                $row['occupancyStatus'] = $this->hasCurrentTenancy($tenanciesByUnit[$unitId] ?? []) ? 'occupied' : 'vacant';
                        }
                        $row['resolvedImageUrl'] = $unit->getResolvedImageUrl();

                        $rows[] = $row;
                }

                return [
                        'columns' => $this->visibleColumns($definitions),
                        'rows' => $rows,
                ];
        }

        /** Batch-load the current ownership scope and reuse the unit finance formulas. */
        public function portfolioPerformance(string $userId, ?int $propertyId = null, ?int $unitId = null, string $role = 'landlord'): array {
                $management = $this->permissionService->isBuildingManagement($role);
                $units = $this->unitMapper->findByUser($userId, $management ? $propertyId : null, !$management);
                $units = array_values(array_filter($units, static fn(Unit $unit) => $unitId === null || $unit->getId() === $unitId));
                $unitIds = array_map(static fn(Unit $unit) => $unit->getId(), $units);
                $propertyIds = array_values(array_unique(array_filter(array_map(static fn(Unit $unit) => $unit->getPropertyId(), $units))));
                $unitSet = array_fill_keys($unitIds, true);
                $tenancies = $units === [] ? [] : array_intersect_key($this->tenancyService->listTenanciesByUnit($userId), $unitSet);
                $bookings = [];
                if ($units !== []) {
                        foreach ($this->bookingService->sumByAccountGrouped($userId, null, 'unit') as $row) {
                                if (isset($unitSet[(int)$row['unit_id']])) {
                                        $bookings[(int)$row['unit_id']][(int)$row['year']][] = $row;
                                }
                        }
                }
                $closedUnits = $this->bookingYearService->getClosedYearsForUnits($unitIds);
                $closedProperties = $this->bookingYearService->getClosedYearsForProperties($propertyIds);
                $topMap = $this->accountService->getTopAccountNumberMap();
                $taxRate = $this->getTaxRateSetting($userId);
                $years = [];
                $unitYears = [];
                $acquisitionYears = [];
                $currentYear = (int)date('Y');
                foreach ($units as $unit) {
                        $id = $unit->getId();
                        $unitYears[$id] = array_fill_keys($this->collectYears($bookings[$id] ?? [], $tenancies[$id] ?? []), true);
                        $historyYears = array_keys($unitYears[$id]);
                        $purchaseYear = (int)substr((string)$unit->getBuyDate(), 0, 4);
                        $acquisitionYears[$id] = $purchaseYear > 0 ? $purchaseYear : ($historyYears === [] ? $currentYear : min($historyYears));
                        $years = array_merge($years, $historyYears, [$acquisitionYears[$id]]);
                }
                $years = array_values(array_filter($years, static fn(int $year) => $year > 0 && $year <= $currentYear));
                // Keep calendar gaps visible and stop at the current, provisional year.
                $years = $years === [] ? [] : range(min($years), $currentYear);
                $trend = [];
                foreach ($years as $reportYear) {
                        $totals = ['baseRent' => 0.0, 'netProfit' => 0.0, 'totalCosts' => 0.0, 'missingCosts' => 0, 'isProvisional' => false];
                        $totals['acquisitionCosts'] = 0.0;
                        $totals['missingAcquisitionCosts'] = 0;
                        $rows = [];
                        foreach ($units as $unit) {
                                $id = $unit->getId();
                                if ($acquisitionYears[$id] <= $reportYear) {
                                        $costs = (float)($unit->getTotalCosts() ?? 0);
                                        $totals['acquisitionCosts'] += $costs;
                                        $totals['missingAcquisitionCosts'] += $costs > 0 ? 0 : 1;
                                }
                                if (!isset($unitYears[$id][$reportYear])) {
                                        continue;
                                }
                                $sums = $this->buildUnitYearSums($unit, $taxRate, $reportYear, $topMap, $tenancies[$id] ?? [], $bookings[$id][$reportYear] ?? []);
                                $values = StatisticCalculations::calculateValues(StatisticCalculations::unitRevenue(), $sums, $topMap);
                                $costs = (float)($unit->getTotalCosts() ?? 0);
                                $provisional = !$this->isYearClosed($reportYear, $id, $unit->getPropertyId(), $closedUnits, $closedProperties);
                                $row = ['unitId' => $id, 'label' => $unit->getLabel(), 'baseRent' => $values['baseRent'],
                                        'netProfit' => $values['netProfit'], 'totalCosts' => $costs, 'acquisitionCosts' => $acquisitionYears[$id] <= $reportYear ? $costs : 0.0,
                                        'netRentability' => $costs > 0 ? $values['netRentability'] : null, 'isProvisional' => $provisional];
                                $rows[] = $row;
                                $totals['baseRent'] += $row['baseRent'];
                                $totals['netProfit'] += $row['netProfit'];
                                $totals['totalCosts'] += $costs;
                                $totals['missingCosts'] += $costs > 0 ? 0 : 1;
                                $totals['isProvisional'] = $totals['isProvisional'] || $provisional;
                        }
                        // Ratios must be recomputed from totals, never averaged across units.
                        $totals['netRentability'] = $rows !== [] && $totals['missingCosts'] === 0 && $totals['totalCosts'] > 0
                                ? $totals['netProfit'] / $totals['totalCosts'] : null;
                        $trend[] = ['year' => $reportYear, 'rows' => $rows] + $totals;
                }
                return ['years' => $years, 'trend' => $trend, 'unitCount' => count($units), 'taxRate' => $taxRate];
        }

        /**
         * @param string[] $accounts
         */
        public function accountTotalsByYear(array $accounts, string $userId, ?int $propertyId = null, ?int $unitId = null): array {
                $accounts = array_values(array_unique(array_filter(array_map('strval', $accounts), static function (string $value): bool {
                        return $value !== '';
                })));
                $accounts = array_values(array_unique(array_map(function (string $value): string {
                        $normalized = ltrim($value, '0');
                        return $normalized === '' ? '0' : $normalized;
                }, $accounts)));
                if ($accounts === []) {
                        return ['years' => [], 'series' => []];
                }

                $rows = $this->bookingService->sumByAccountPerYear($userId, $accounts, $propertyId, $unitId);
                $years = [];
                $series = [];
                foreach ($accounts as $account) {
                        $series[$account] = [];
                }

                foreach ($rows as $row) {
                        $year = (int)($row['year'] ?? 0);
                        if ($year === 0) {
                                continue;
                        }
                        $years[$year] = true;
                }

                if ($years === []) {
                        return ['years' => [], 'series' => []];
                } else {
                        $years = array_keys($years);
                        sort($years, SORT_NUMERIC);
                }

                $yearIndex = array_flip($years);
                foreach ($series as $account => $values) {
                        $series[$account] = array_fill(0, count($years), 0.0);
                }

                foreach ($rows as $row) {
                        $year = (int)($row['year'] ?? 0);
                        $account = (string)($row['account'] ?? '');
                        if ($year === 0 || $account === '' || !isset($series[$account])) {
                                continue;
                        }
                        $index = $yearIndex[$year] ?? null;
                        if ($index === null) {
                                continue;
                        }
                        $series[$account][$index] = round((float)($row['total'] ?? 0.0), 2);
                }

                return ['years' => $years, 'series' => $series];
        }

        private function normalizeColumns(array $columns): array {
                return array_map(function (array $column) {
                        if (!isset($column['key'])) {
                                $column['key'] = $column['account'] ?? uniqid('col_', true);
                        }
                        if (!isset($column['label'])) {
                                $column['label'] = (string)$column['key'];
                        }

                        $column['label'] = $this->l10n->t((string)$column['label']);
                        if (isset($column['help']) && is_array($column['help'])) {
                                $column['help'] = $this->normalizeHelpText($column['help']);
                        }

                        if (!isset($column['visible'])) {
                                $column['visible'] = true;
                        }
                        if (!isset($column['format']) && isset($column['rule']) && $this->containsOperation($column['rule'], 'divide')) {
                                $column['format'] = 'percentage';
                        }
                        return $column;
                }, $columns);
        }

        private function normalizeHelpText(array $help): array {
                foreach (['title', 'summary', 'calculation', 'includes', 'excludes'] as $field) {
                        if (isset($help[$field]) && is_string($help[$field])) {
                                $help[$field] = $this->l10n->t($help[$field]);
                        }
                }

                return $help;
        }

        private function containsOperation(array $rule, string $operation): bool {
                foreach ($rule as $step) {
                        if (($step['operation'] ?? null) === $operation) {
                                return true;
                        }
                }

                return false;
        }

        private function mapSums(array $rows, array $topAccountMap): array {
                $sums = [];
                foreach ($rows as $row) {
                        if (!isset($row['account'])) {
                                continue;
                        }
                        $account = $this->resolveTopAccountNumber((string)$row['account'], $topAccountMap);
                        if (!isset($sums[$account])) {
                                $sums[$account] = 0.0;
                        }
                        $sums[$account] += (float)($row['total'] ?? 0.0);
                }
                return $sums;
        }

        private function mapSumsByYear(array $rows, array $topAccountMap): array {
                $perYear = [];
                foreach ($rows as $row) {
                        if (!isset($row['year'])) {
                                continue;
                        }
                        $year = (int)$row['year'];
                        $account = (string)($row['account'] ?? '');
                        if ($account === '') {
                                continue;
                        }
                        if (!isset($perYear[$year])) {
                                $perYear[$year] = [];
                        }
                        $account = $this->resolveTopAccountNumber($account, $topAccountMap);
                        if (!isset($perYear[$year][$account])) {
                                $perYear[$year][$account] = 0.0;
                        }
                        $perYear[$year][$account] += (float)($row['total'] ?? 0.0);
                }
                return $perYear;
        }

        private function collectYears(array $bookingSums, array $tenancies): array {
                $years = array_keys($bookingSums);
                $currentYear = (int)date('Y');

                foreach ($tenancies as $tenancy) {
                        $start = InputValidation::date($tenancy->getStartDate());
                        $end = InputValidation::date($tenancy->getEndDate());
                        if ($start === null) {
                                continue;
                        }

                        $startYear = (int)$start->format('Y');
                        $endYear = $end ? (int)$end->format('Y') : max($startYear, $currentYear);

                        for ($year = $startYear; $year <= $endYear; $year++) {
                                $years[] = $year;
                        }
                }

                $years = array_values(array_unique($years));
                rsort($years, SORT_NUMERIC);

                return $years;
        }

        private function buildRowForYear(int $year, array $definitions, array $sums, array $context = [], array $topAccountMap = []): array {
                $row = [];
                $calculated = [];
                foreach ($definitions as $column) {
                        $key = $column['key'];
                        $value = $this->resolveColumnValue($column, $year, $sums, $context, $calculated, $topAccountMap);
                        $calculated[$key] = $value;
                        $row[$key] = isset($column['account']) || isset($column['rule'])
                                ? $this->formatColumnValue($column, $value) : $value;
                }
                return $row;
        }

        private function resolveColumnValue(array $column, int $year, array $sums, array $context, array $computed, array $topAccountMap): mixed {
                $key = $column['key'];

                if (($column['type'] ?? '') === 'year') {
                        return $year;
                }

                if (($column['source'] ?? '') === 'unit' && isset($context['unit'])) {
                        return $this->resolveUnitField($context['unit'], $column['field'] ?? $key);
                }

                if (isset($column['account']) || isset($column['rule'])) {
                        return StatisticCalculations::calculateColumn($column, $sums, $computed, $topAccountMap);
                }

                return null;
        }

        private function formatColumnValue(array $column, float $value): float {
                if (($column['format'] ?? '') === 'percentage') {
                        return round($value, 4);
                }
                return round($value, 2);
        }

        private function mergeSums(array ...$sums): array {
                $merged = [];
                foreach ($sums as $sum) {
                        foreach ($sum as $account => $value) {
                                if (!isset($merged[$account])) {
                                        $merged[$account] = 0.0;
                                }
                                $merged[$account] += (float)$value;
                        }
                }

                return $merged;
        }

        private function buildUnitSums(?Unit $unit): array {
                if (!$unit) {
                        return [];
                }

                $totalCosts = $unit->getTotalCosts();
                if ($totalCosts === null || $totalCosts === '') {
                        return [];
                }

                return ['3000' => (float)$totalCosts];
        }

        private function resolveUnitField(Unit $unit, string $field): mixed {
                $method = 'get' . ucfirst($field);

                try {
                        // Nextcloud entities expose fields via magic __call, so directly invoke
                        // the getter and let __call resolve it when no concrete method exists.
                        $value = $unit->$method();
                } catch (\Throwable $e) {
                        $this->logger->warning('StatisticsService: failed to resolve unit field', [
                                'field' => $field,
                                'exception' => $e,
                        ]);

                        return null;
                }

                return is_numeric($value) ? (float)$value : $value;
        }

        private function initializeStatisticsTables(array $definitions): array {
                $tables = [];
                foreach ($definitions as $tableName => $tableDefinitions) {
                        $tables[$tableName] = [
                                'columns' => $this->visibleColumns($tableDefinitions),
                                'rows' => [],
                        ];
                }

                return $tables;
        }

        private function buildStatisticsTables(array $definitions, callable $rowFactory): array {
                $tables = $this->initializeStatisticsTables($definitions);

                foreach ($definitions as $tableName => $tableDefinitions) {
                        $tables[$tableName]['rows'][] = $rowFactory($tableDefinitions);
                }

                return $tables;
        }

        private function buildUnitYearSums(?Unit $unit, float $taxRate, int $year, array $topAccountMap, array $tenancies, array $bookings): array {
                return $this->applyTaxRate($this->mergeSums(
                        $this->mapSums($bookings, $topAccountMap),
                        $this->mapSumsToTopAccounts($this->tenancyService->sumTenanciesForYear($tenancies, $year), $topAccountMap),
                        $this->mapSumsToTopAccounts($this->buildUnitSums($unit), $topAccountMap),
                ), $taxRate);
        }

        private function loadUnit(int $unitId, string $userId): Unit {
                $unit = $this->unitMapper->findForUser($unitId, $userId);
                if ($unit === null) {
                        throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
                }
                return $unit;
        }

        private function buildEmptyStatisticsRowForUnit(?Unit $unit, array $definitions): array {
                $row = [];
                foreach ($definitions as $column) {
                        if (($column['type'] ?? '') === 'year') {
                                $row[$column['key']] = null;
                                continue;
                        }
                        if (($column['source'] ?? '') === 'unit' && $unit !== null) {
                                $row[$column['key']] = $this->resolveUnitField($unit, $column['field'] ?? $column['key']);
                                continue;
                        }
                        $row[$column['key']] = null;
                }
                return $row;
        }

        private function getLatestClosedYearForUnit(int $unitId, ?int $propertyId, array $closedUnitYears, array $closedPropertyYears): ?int {
                $years = [];
                if (isset($closedUnitYears[$unitId])) {
                        $years = array_merge($years, array_keys($closedUnitYears[$unitId]));
                }
                if ($propertyId !== null && isset($closedPropertyYears[$propertyId])) {
                        $years = array_merge($years, array_keys($closedPropertyYears[$propertyId]));
                }
                if ($years === []) {
                        return null;
                }
                return max(array_map('intval', $years));
        }

        private function hasCurrentTenancy(array $tenancies): bool {
                foreach ($tenancies as $tenancy) {
                        if ($tenancy->getStatus() === 'active') {
                                return true;
                        }
                }

                return false;
        }

        private function visibleColumns(array $definitions): array {
                return array_values(array_map(fn(array $col) => [
                        'key' => $col['key'],
                        'label' => $col['label'],
                        'format' => $col['format'] ?? null,
                        'unit' => $col['unit'] ?? null,
                        'help' => $col['help'] ?? null,
                ], array_filter($definitions, fn(array $definition) => $definition['visible'] ?? true)));
        }

        private function resolveTopAccountNumber(string $account, ?array $topAccountMap = null): string {
                return $this->accountService->resolveTopAccountNumber($account, $topAccountMap);
        }

        private function mapSumsToTopAccounts(array $sums, array $topAccountMap): array {
                $mapped = [];
                foreach ($sums as $account => $value) {
                        $resolved = $this->resolveTopAccountNumber((string)$account, $topAccountMap);
                        if (!isset($mapped[$resolved])) {
                                $mapped[$resolved] = 0.0;
                        }
                        $mapped[$resolved] += (float)$value;
                }
                return $mapped;
        }

        private function applyTaxRate(array $sums, float $taxRate): array {
                $sums['taxRate'] = $taxRate;
                return $sums;
        }

        private function isYearClosed(int $year, int $unitId, ?int $propertyId, array $closedUnitYears, array $closedPropertyYears): bool {
                if (isset($closedUnitYears[$unitId][$year])) {
                        return true;
                }

                if ($propertyId !== null && isset($closedPropertyYears[$propertyId][$year])) {
                        return true;
                }

                return false;
        }

        private function getTaxRateSetting(string $userId): float {
                $value = $this->portfolioSettings->getValue($userId, 'taxRate', '0');
                if (!is_numeric($value)) {
                        return 0.0;
                }
                return (float)$value;
        }

}
