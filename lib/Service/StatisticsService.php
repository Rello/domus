<?php

namespace OCA\Domus\Service;

use OCP\IL10N;
use OCA\Domus\Db\UnitMapper;
use Psr\Log\LoggerInterface;

class StatisticsService {
    private array $unitStatColumns = [
        ['key' => 'year', 'label' => 'year', 'type' => 'year'],
        ['key' => 'rent', 'label' => 'Kaltmiete', 'account' => '1000'],
		[
			'key' => 'hgnu',
			'label' => 'Nich umlagef.',
			'rule' => [
				['op' => 'add', 'args' => ['2001', '2004']],
			],
		],
		['key' => 'zinsen', 'label' => 'Kreditzinsen', 'account' => '2006'],
		[
			'key' => 'gwb',
			'label' => 'Gewinn Brutto',
			'rule' => [
				['op' => 'sub', 'args' => ['rent', 'hgnu']],
				['op' => 'sub', 'args' => ['prev', 'zinsen']],
			],
		],
		[
			'key' => 'abschr',
			'label' => 'Abschr. & sonstige',
			'rule' => [
				['op' => 'add', 'args' => ['2007', '2008']],
			],
		],
		[
			'key' => 'steuer',
			'label' => 'Steuern',
			'rule' => [
				['op' => 'sub', 'args' => ['gwb', 'abschr']],
				['op' => 'mul', 'args' => ['prev', '2009']],
			],
		],
                [
                        'key' => 'gwn',
                        'label' => 'Gewinn Netto',
                        'rule' => [
                                ['op' => 'sub', 'args' => ['gwb', 'steuer']],
                        ],
                ],
                [
                        'key' => 'totalCost',
                        'label' => 'Total Cost',
                        'account' => '3000',
                ],
                [
                        'key' => 'netRentab',
                        'label' => 'Rentab. Netto',
                        'rule' => [
                                ['op' => 'div', 'args' => ['gwn', '3000']],
			],
		],

	];

    public function __construct(
        private BookingService $bookingService,
        private TenancyService $tenancyService,
        private UnitMapper $unitMapper,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function unitStatPerYear(int $unitId, string $userId, int $year, ?array $columns = null): array {
        $definitions = $this->normalizeColumns($columns ?? $this->unitStatColumns);
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

        $sums = $this->mapSums($grouped);
        $this->logger->info('StatisticsService: sums for unit extracted', ['sums' => $sums]);

        $tenancySums = $this->tenancyService->sumTenancyForYear($userId, $unitId, $year);
        $unitSums = $this->buildUnitSums($unitId, $userId);
        $mergedSums = $this->mergeSums($sums, $tenancySums, $unitSums);
        $this->logger->info('StatisticsService: merged booking and tenancy sums', ['sums' => $mergedSums]);

        $row = $this->buildRowForYear($year, $definitions, $mergedSums);

        $this->logger->info('StatisticsService: calculated statistics row', ['row' => $row]);

        return [
            'columns' => array_map(fn(array $col) => ['key' => $col['key'], 'label' => $col['label'], 'format' => $col['format'] ?? null], $definitions),
            'rows' => [$row],
        ];
    }

    public function unitStatsAllYears(int $unitId, string $userId, ?array $columns = null): array {
        $definitions = $this->normalizeColumns($columns ?? $this->unitStatColumns);
        $this->logger->info('StatisticsService: calculating unit stats for all years', [
            'unitId' => $unitId,
            'userId' => $userId,
            'columns' => array_column($definitions, 'key'),
        ]);

        $grouped = $this->bookingService->sumByAccountGrouped($userId, null, 'unit', $unitId);
        $this->logger->info('StatisticsService: grouped sums fetched for all years', [
            'count' => count($grouped),
            'grouped' => $grouped,
        ]);

        $perYearSums = $this->mapSumsByYear($grouped);
        $years = $this->collectYears($perYearSums, $this->tenancyService->getTenanciesForUnit($unitId, $userId));

        $unitSums = $this->buildUnitSums($unitId, $userId);

        $rows = array_map(function (int $year) use ($definitions, $perYearSums, $unitId, $userId, $unitSums) {
            $tenancySums = $this->tenancyService->sumTenancyForYear($userId, $unitId, $year);
            $mergedSums = $this->mergeSums($perYearSums[$year] ?? [], $tenancySums, $unitSums);
            return $this->buildRowForYear($year, $definitions, $mergedSums);
        }, $years);

        $this->logger->info('StatisticsService: calculated statistics rows for all years', [
            'rows' => $rows,
        ]);

        return [
            'columns' => array_map(fn(array $col) => ['key' => $col['key'], 'label' => $col['label'], 'format' => $col['format'] ?? null], $definitions),
            'rows' => $rows,
        ];
    }

    private function normalizeColumns(array $columns): array {
        return array_map(function (array $column) {
            if (!isset($column['key'])) {
                $column['key'] = $column['account'] ?? uniqid('col_', true);
            }
            if (!isset($column['label'])) {
                $column['label'] = (string)$column['key'];
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

    private function mapSums(array $rows): array {
        $sums = [];
        foreach ($rows as $row) {
            if (!isset($row['account'])) {
                $this->logger->info('StatisticsService: skipping row missing account', ['row' => $row]);
                continue;
            }
            $account = (string)$row['account'];
            $sums[$account] = (float)($row['total'] ?? 0.0);
        }
        return $sums;
    }

    private function mapSumsByYear(array $rows): array {
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
            $perYear[$year][$account] = (float)($row['total'] ?? 0.0);
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

    private function buildRowForYear(int $year, array $definitions, array $sums): array {
        $row = [];
        foreach ($definitions as $column) {
            $key = $column['key'];
            if (($column['type'] ?? '') === 'year') {
                $row[$key] = $year;
                continue;
            }
            if (isset($column['account'])) {
                $row[$key] = round($this->get($sums, (string)$column['account']), 2);
                continue;
            }
            if (isset($column['rule'])) {
                $row[$key] = round($this->evalRule($sums, $column['rule'], $row), 2);
                continue;
            }
            $row[$key] = null;
        }
        return $row;
    }

	private function evalRule(array $sums, array $rule, array $computed = []): float {
		$prev = 0.0;

		foreach ($rule as $step) {
			$op = $step['op'] ?? '';
			$args = $step['args'] ?? [];

			// Resolve args with precedence:
			// 1) 'prev' special token -> last step result
			// 2) previously computed column key present in $computed
			// 3) account lookup in $sums
			$values = array_map(function ($arg) use (&$prev, $sums, $computed) {
				if ($arg === 'prev') {
					return $prev;
				}
				// If arg refers to a previously computed column key, use its value
				if (is_string($arg) && array_key_exists($arg, $computed)) {
					return (float)($computed[$arg] ?? 0.0);
				}
				// Fallback: treat as account number / sum key
				return $this->get($sums, (string)$arg);
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

    private function buildUnitSums(int $unitId, string $userId): array {
        try {
            $unit = $this->unitMapper->findForUser($unitId, $userId);
        } catch (\Throwable $e) {
            $this->logger->error('StatisticsService: failed to load unit while building sums', [
                'unitId' => $unitId,
                'exception' => $e,
            ]);
            return [];
        }

        if (!$unit) {
            $this->logger->info('StatisticsService: unit not found while building sums', [
                'unitId' => $unitId,
                'userId' => $userId,
            ]);
            return [];
        }

        $totalCosts = $unit->getTotalCosts();
        if ($totalCosts === null || $totalCosts === '') {
            return [];
        }

        return ['3000' => (float)$totalCosts];
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
