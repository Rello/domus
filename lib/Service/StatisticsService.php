<?php

namespace OCA\Domus\Service;

use OCP\IL10N;
use Psr\Log\LoggerInterface;

class StatisticsService {
    private array $unitStatColumns = [
        ['key' => 'year', 'label' => 'year', 'type' => 'year'],
        ['key' => 'kaltmiete', 'label' => 'Kaltmiete', 'account' => '1000'],
        ['key' => 'nebenkosten', 'label' => 'Nebenkosten', 'account' => '1001'],
        [
            'key' => 'ratio',
            'label' => 'Ratio',
            'rule' => [
                ['op' => 'add', 'args' => ['1000', '1001']],
                ['op' => 'div', 'args' => ['prev', '1000']],
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

        $grouped = $this->bookingService->sumByAccountGrouped($userId, $year, 'unit');
        $this->logger->info('StatisticsService: grouped sums fetched', ['count' => count($grouped)]);

        $sums = $this->filterSumsForUnit($grouped, $unitId);
        $this->logger->info('StatisticsService: sums for unit extracted', ['sums' => $sums]);

        $row = [];
        foreach ($definitions as $column) {
            $key = $column['key'];
            if (($column['type'] ?? '') === 'year') {
                $row[$key] = $year;
                continue;
            }
            if (isset($column['account'])) {
                $row[$key] = $this->get($sums, (string)$column['account']);
                continue;
            }
            if (isset($column['rule'])) {
                $row[$key] = $this->evalRule($sums, $column['rule']);
                continue;
            }
            $row[$key] = null;
        }

        $this->logger->info('StatisticsService: calculated statistics row', ['row' => $row]);

        return [
            'columns' => array_map(fn(array $col) => ['key' => $col['key'], 'label' => $col['label']], $definitions),
            'rows' => [$row],
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

    private function filterSumsForUnit(array $rows, int $unitId): array {
        $sums = [];
        foreach ($rows as $row) {
            if (!isset($row['unit_id'], $row['account'])) {
                continue;
            }
            if ((int)$row['unit_id'] !== $unitId) {
                continue;
            }
            $account = (string)$row['account'];
            $sums[$account] = (float)($row['total'] ?? 0.0);
        }
        return $sums;
    }

    private function evalRule(array $sums, array $rule): float {
        $prev = 0.0;

        foreach ($rule as $step) {
            $op = $step['op'] ?? '';
            $args = $step['args'] ?? [];
            $values = array_map(function ($arg) use (&$prev, $sums) {
                if ($arg === 'prev') {
                    return $prev;
                }
                return $this->get($sums, (string)$arg);
            }, $args);

            switch ($op) {
                case 'add':
                    $prev = $this->addValues(...$values);
                    break;
                case 'div':
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

    private function divValues(float $a, float $b): float {
        if ($b == 0.0) {
            return 0.0;
        }
        return $a / $b;
    }
}
