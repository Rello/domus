<?php

namespace OCA\Domus\Service;

use OCP\IL10N;
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

	];

    public function __construct(
        private BookingService $bookingService,
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

        $row = $this->buildRowForYear($year, $definitions, $sums);

        $this->logger->info('StatisticsService: calculated statistics row', ['row' => $row]);

        return [
            'columns' => array_map(fn(array $col) => ['key' => $col['key'], 'label' => $col['label']], $definitions),
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
        $years = array_keys($perYearSums);
        rsort($years, SORT_NUMERIC);

        $rows = array_map(function (int $year) use ($definitions, $perYearSums) {
            return $this->buildRowForYear($year, $definitions, $perYearSums[$year] ?? []);
        }, $years);

        $this->logger->info('StatisticsService: calculated statistics rows for all years', [
            'rows' => $rows,
        ]);

        return [
            'columns' => array_map(fn(array $col) => ['key' => $col['key'], 'label' => $col['label']], $definitions),
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
            return $column;
        }, $columns);
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
