<?php

namespace OCA\Domus\Service;

use OCA\Domus\Accounting\StatisticCalculations;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class StatisticsService {
        public function __construct(
                private BookingService $bookingService,
                private TenancyService $tenancyService,
                private UnitMapper $unitMapper,
                private PermissionService $permissionService,
                private AccountService $accountService,
                private IL10N $l10n,
                private LoggerInterface $logger,
        ) {
        }

        public function unitStatPerYear(int $unitId, string $userId, int $year): array {
                $unit = $this->loadUnit($unitId, $userId);
                $topAccountMap = $this->accountService->getTopAccountNumberMap();

                $definitions = [
                        'revenue' => $this->normalizeColumns(StatisticCalculations::unitRevenue()),
                        'cost' => $this->normalizeColumns(StatisticCalculations::unitCost()),
                ];

                return $this->buildStatisticsTables($definitions, function (array $tableDefinitions) use ($unitId, $unit, $userId, $year, $topAccountMap) {
                        return $this->buildStatisticsRowForUnitYear(
                                $unitId,
                                $unit,
                                $userId,
                                $year,
                                $tableDefinitions,
                                $topAccountMap,
                        );
                });
        }

        public function unitStatsAllYears(int $unitId, string $userId, ?array $columns = null): array {
                $unit = $this->loadUnit($unitId, $userId);
                $topAccountMap = $this->accountService->getTopAccountNumberMap();

                $definitions = [
                        'revenue' => $this->normalizeColumns(StatisticCalculations::unitRevenue()),
                        'cost' => $this->normalizeColumns(StatisticCalculations::unitCost()),
                ];

                $grouped = $this->bookingService->sumByAccountGrouped($userId, null, 'unit', $unitId);
                $perYearSums = $this->mapSumsByYear($grouped, $topAccountMap);
                $years = $this->collectYears($perYearSums, $this->tenancyService->getTenanciesForUnit($unitId, $userId));

                $tables = $this->initializeStatisticsTables($definitions);
                foreach ($years as $year) {
                        $tenancySums = $this->mapSumsToTopAccounts(
                                $this->tenancyService->sumTenancyForYear($userId, $unitId, $year),
                                $topAccountMap,
                        );
                        $unitSums = $this->mapSumsToTopAccounts($this->buildUnitSums($unit), $topAccountMap);
                        $sums = $this->mergeSums($perYearSums[$year] ?? [], $tenancySums, $unitSums);

                        foreach ($definitions as $tableName => $tableDefinitions) {
                                $tables[$tableName]['rows'][] = $this->buildRowForYear(
                                        $year,
                                        $tableDefinitions,
                                        $sums,
                                        ['unit' => $unit],
                                        $topAccountMap,
                                );
                        }
                }

                $this->logger->info('StatisticsService: calculated statistics rows for all years', [
                        'tables' => $tables,
                ]);

                return $tables;
        }

        public function unitOverview(int $year, string $userId, ?int $propertyId = null, string $role = 'landlord'): array {
                $definitions = $this->normalizeColumns(StatisticCalculations::unitOverview());
                $topAccountMap = $this->accountService->getTopAccountNumberMap();
                $isBuildingManagement = $this->permissionService->isBuildingManagement($role);
                $propertyFilter = $isBuildingManagement ? $propertyId : null;
                $units = $this->unitMapper->findByUser($userId, $propertyFilter, !$isBuildingManagement);
                $rows = [];

                foreach ($units as $unit) {
                        $row = $this->buildStatisticsRowForUnitYear(
                                $unit->getId(),
                                $unit,
                                $userId,
                                $year,
                                $definitions,
                                $topAccountMap,
                        );

                        $rows[] = $row;
                }

                return [
                        'columns' => $this->visibleColumns($definitions),
                        'rows' => $rows,
                ];
        }

        /**
         * @param string[] $accounts
         */
        public function accountTotalsByYear(array $accounts, string $userId): array {
                $accounts = array_values(array_unique(array_filter(array_map('strval', $accounts), static function (string $value): bool {
                        return $value !== '';
                })));
                if ($accounts === []) {
                        return ['years' => [], 'series' => []];
                }

                $rows = $this->bookingService->sumByAccountPerYear($userId, $accounts);
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
                        $years = [(int)date('Y')];
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

                        if (!isset($column['visible'])) {
                                $column['visible'] = true;
                        }
                        if (!isset($column['format']) && isset($column['rule']) && $this->containsOperation($column['rule'], 'div')) {
                                $column['format'] = 'percentage';
                        }
                        return $column;
                }, $columns);
        }

        private function containsOperation(array $rule, string $operation): bool {
                foreach ($rule as $step) {
                        if (($step['op'] ?? null) === $operation) {
                                return true;
                        }
                }

                return false;
        }

        private function mapSums(array $rows, array $topAccountMap): array {
                $sums = [];
                foreach ($rows as $row) {
                        if (!isset($row['account'])) {
                                $this->logger->info('StatisticsService: skipping row missing account', ['row' => $row]);
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
                                $this->logger->info('StatisticsService: skipping row missing year', ['row' => $row]);
                                continue;
                        }
                        $year = (int)$row['year'];
                        $account = (string)($row['account'] ?? '');
                        if ($account === '') {
                                $this->logger->info('StatisticsService: skipping row missing account while grouping by year', ['row' => $row]);
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
                        try {
                                $start = new \DateTimeImmutable($tenancy->getStartDate());
                        } catch (\Exception $e) {
                                $this->logger->info('StatisticsService: skipping tenancy while collecting years due to invalid start date', [
                                        'tenancyId' => $tenancy->getId(),
                                ]);
                                continue;
                        }

                        $end = null;
                        if ($tenancy->getEndDate()) {
                                try {
                                        $end = new \DateTimeImmutable($tenancy->getEndDate());
                                } catch (\Exception $e) {
                                        $this->logger->info('StatisticsService: skipping tenancy end date parsing', [
                                                'tenancyId' => $tenancy->getId(),
                                        ]);
                                }
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
                foreach ($definitions as $column) {
                        $key = $column['key'];
                        $row[$key] = $this->resolveColumnValue($column, $year, $sums, $context, $row, $topAccountMap);
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

                if (isset($column['account'])) {
                        $account = $this->resolveTopAccountNumber((string)$column['account'], $topAccountMap);
                        return round($this->get($sums, $account), 2);
                }
                if (isset($column['rule'])) {
                        return round($this->evalRule($sums, $column['rule'], $computed, $topAccountMap), 2);
                }

                return null;
        }

        private function evalRule(array $sums, array $rule, array $computed = [], array $topAccountMap = []): float {
                $prev = 0.0;

                foreach ($rule as $step) {
                        $op = $step['op'] ?? '';
                        $args = $step['args'] ?? [];

                        // Resolve args with precedence:
                        // 1) 'prev' special token -> last step result
                        // 2) previously computed column key present in $computed
                        // 3) account lookup in $sums
                        $values = array_map(function ($arg) use (&$prev, $sums, $computed, $topAccountMap) {
                                if ($arg === 'prev') {
                                        return $prev;
                                }
                                // If arg refers to a previously computed column key, use its value
                                if (is_string($arg) && array_key_exists($arg, $computed)) {
                                        return (float)($computed[$arg] ?? 0.0);
                                }
                                // Fallback: treat as account number / sum key
                                $account = $this->resolveTopAccountNumber((string)$arg, $topAccountMap);
                                return $this->get($sums, $account);
                        }, $args);

                        switch ($op) {
                                case 'add':
                                        // Step 1: addition
                                        $prev = $this->addValues(...$values);
                                        break;
                                case 'sub':
                                        // Step 2: subtraction (left-to-right)
                                        $prev = $this->subValues(...$values);
                                        break;
                                case 'mul':
                                        // Step 3: multiplication
                                        $prev = $this->mulValues(...$values);
                                        break;
                                case 'div':
                                        // existing division behavior
                                        $prev = $this->divValues($values[0] ?? 0.0, $values[1] ?? 0.0);
                                        break;
                                default:
                                        throw new \InvalidArgumentException($this->l10n->t('Unsupported operation.'));
                        }
                }

                return $prev;
        }

        private function get(array $sums, string $nr): float {
                return (float)($sums[$nr] ?? 0.0);
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
                        $this->logger->info('StatisticsService: failed to resolve unit field', [
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

        private function buildStatisticsRowForUnitYear(int $unitId, ?Unit $unit, string $userId, int $year, array $definitions, array $topAccountMap = []): array {
                $this->logger->info('StatisticsService: calculating unit stats', [
                        'unitId' => $unitId,
                        'userId' => $userId,
                        'year' => $year,
                        'columns' => array_column($definitions, 'key'),
                ]);

                $grouped = $this->bookingService->sumByAccountGrouped($userId, $year, 'unit', $unitId);
                $this->logger->info('StatisticsService: grouped sums fetched', [
                        'count' => count($grouped),
                        'grouped' => $grouped,
                ]);

                $sums = $this->mapSums($grouped, $topAccountMap);
                $this->logger->info('StatisticsService: sums for unit extracted', ['sums' => $sums]);

                $tenancySums = $this->mapSumsToTopAccounts(
                        $this->tenancyService->sumTenancyForYear($userId, $unitId, $year),
                        $topAccountMap,
                );
                $unitSums = $this->mapSumsToTopAccounts($this->buildUnitSums($unit), $topAccountMap);
                $mergedSums = $this->mergeSums($sums, $tenancySums, $unitSums);
                $this->logger->info('StatisticsService: merged booking and tenancy sums', ['sums' => $mergedSums]);

                $row = $this->buildRowForYear($year, $definitions, $mergedSums, ['unit' => $unit], $topAccountMap);

                $this->logger->info('StatisticsService: calculated statistics row', ['row' => $row]);

                return $row;
        }

        private function loadUnit(int $unitId, string $userId): ?Unit {
                try {
                        return $this->unitMapper->findForUser($unitId, $userId);
                } catch (\Throwable $e) {
                        $this->logger->error('StatisticsService: failed to load unit while building sums', [
                                'unitId' => $unitId,
                                'exception' => $e,
                        ]);
                }

                return null;
        }

        private function visibleColumns(array $definitions): array {
                return array_values(array_map(fn(array $col) => [
                        'key' => $col['key'],
                        'label' => $col['label'],
                        'format' => $col['format'] ?? null,
                        'unit' => $col['unit'] ?? null,
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

        private function addValues(float ...$values): float {
                return array_sum($values);
        }

        private function subValues(float ...$values): float {
                // If no values provided, return 0.0 to remain consistent with other helpers
                if (count($values) === 0) {
                        return 0.0;
                }
                // Subtract subsequent values from the first value (left-to-right)
                $result = array_shift($values);
                foreach ($values as $v) {
                        $result -= $v;
                }
                return $result;
        }

        private function mulValues(float ...$values): float {
                // If no values provided, return 0.0 (consistent with add/div behaviour for empty input)
                if (count($values) === 0) {
                        return 0.0;
                }
                $product = 1.0;
                foreach ($values as $v) {
                        $product *= $v;
                }
                return $product;
        }

        private function divValues(float $a, float $b): float {
                if ($b == 0.0) {
                        return 0.0;
                }
                return $a / $b;
        }
}
