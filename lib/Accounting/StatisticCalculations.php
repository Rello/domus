<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Accounting;

class StatisticCalculations {
    public static function unitRevenue(): array {
        return [
            ['key' => 'year', 'label' => 'Year', 'type' => 'year'],
            [
                'key' => 'baseRent',
                'label' => 'Base rent',
                'account' => '1000',
                'help' => [
                    'title' => 'Base rent',
                    'summary' => 'Annual recurring base rent agreed in the tenancy assigned to this unit. This is not a record of payments received.',
                    'calculation' => 'This column sums the amount from account 1000 for the selected year. It uses the tenancy base rent and does not add utility prepayments.',
                    'includes' => 'Recurring base rent agreed in the tenancy for the active period of the year.',
                    'excludes' => 'Utility costs, deposits, one-time charges, and property-level cost postings.',
                ],
            ],
            [
                'key' => 'nonAllocableCosts',
                'label' => 'Non-allocable costs',
                'rule' => [
                    ['operation' => 'add', 'operands' => ['2100', '2300']],
                ],
            ],
            ['key' => 'loanInterest', 'label' => 'Loan interest', 'account' => '2500'],
            [
                'key' => 'grossProfit',
                'label' => 'Gross profit',
                'rule' => [
                    ['operation' => 'subtract', 'operands' => ['baseRent', 'nonAllocableCosts', 'loanInterest']],
                ],
            ],
            [
                'key' => 'depreciationAndOthers',
                'label' => 'Depreciation & others',
                'rule' => [
                    ['operation' => 'add', 'operands' => ['2600', '2700']],
                ],
            ],
            [
                'key' => 'estimatedTaxes',
                'label' => 'Estimated taxes',
                'rule' => [
                    ['operation' => 'subtract', 'operands' => ['grossProfit', 'depreciationAndOthers']],
                    ['operation' => 'multiply', 'operands' => ['previousResult', 'taxRate']],
                ],
                'help' => [
                    'title' => 'Estimated taxes',
                    'summary' => 'Calculated with the tax rate shown above the financial table; this is not a settled tax amount.',
                    'calculation' => 'Gross profit minus depreciation and other amounts, multiplied by the configured tax rate.',
                ],
            ],
            [
                'key' => 'netProfit',
                'label' => 'Estimated net profit',
                'rule' => [
                    ['operation' => 'subtract', 'operands' => ['grossProfit', 'estimatedTaxes']],
                ],
                'help' => [
                    'title' => 'Estimated net profit',
                    'summary' => 'Gross profit after estimated taxes, not a payment balance.',
                    'calculation' => 'Gross profit minus estimated taxes.',
                ],
            ],
            [
                'key' => 'netRentability',
                'label' => 'Estimated rentability (net)',
                'rule' => [
                    ['operation' => 'divide', 'operands' => ['netProfit', '3000']],
                ],
                'format' => 'percentage',
                'help' => [
                    'title' => 'Estimated rentability (net)',
                    'summary' => 'Calculated using estimated net profit.',
                    'calculation' => 'Estimated net profit divided by the unit value recorded in account 3000.',
                ],
            ],
        ];
    }

    public static function unitCost(): array {
        return [
            ['key' => 'year', 'label' => 'Year', 'type' => 'year'],
            ['key' => 'serviceCharge', 'label' => 'Utility costs', 'account' => '1001'],
            [
                'key' => 'allocableCosts',
                'label' => 'Maint. fee (allocable) & property tax',
                'rule' => [
                    ['operation' => 'add', 'operands' => [Accounts::ALLOCABLE_MAINTENANCE, Accounts::PROPERTY_TAX]],
                ],
            ],
            [
                'key' => 'tenantBalance',
                'label' => 'Saldo tenant',
                'rule' => [
                    ['operation' => 'subtract', 'operands' => ['1001', Accounts::ALLOCABLE_MAINTENANCE, Accounts::PROPERTY_TAX]],
                ],
            ],
        ];
    }

    public static function unitOverview(): array {
        $columns = [
            ['key' => 'unitId', 'label' => 'Unit ID', 'source' => 'unit', 'field' => 'id', 'visible' => false],
            ['key' => 'label', 'label' => 'Unit', 'source' => 'unit', 'field' => 'label'],
            ['key' => 'livingArea', 'label' => 'Size', 'source' => 'unit', 'field' => 'livingArea', 'format' => 'number', 'unit' => 'm²'],
        ];
        foreach (self::unitRevenue() as $column) {
            $column['visible'] = in_array($column['key'], ['year', 'baseRent', 'grossProfit', 'netRentability'], true);
            $columns[] = $column;
            if ($column['key'] === 'baseRent') {
                $columns[] = [
                    'key' => 'baseRentPerSquareMeter', 'label' => 'Rent/m²',
                    'rule' => [['operation' => 'divide', 'operands' => ['baseRent', 'livingArea']]],
                    'format' => 'number', 'unit' => '€/m²',
                ];
            }
        }
        return $columns;
    }

    /** Evaluate the definitions without rounding intermediate results. */
    public static function calculateValues(array $definitions, array $accountSums, array $topAccountMap = []): array {
        $calculated = [];
        foreach ($definitions as $column) {
            if (isset($column['account']) || isset($column['rule'])) {
                $calculated[$column['key']] = self::calculateColumn($column, $accountSums, $calculated, $topAccountMap);
            }
        }
        return $calculated;
    }

    /** Generic interpreter; business formulas belong beside each column's key and label. */
    public static function calculateColumn(array $column, array $accountSums, array $calculated = [], array $topAccountMap = []): float {
        $accountValue = static fn(string $account): float => (float)($accountSums[$topAccountMap[$account] ?? $account] ?? 0.0);
        if (isset($column['account'])) {
            return $accountValue($column['account']);
        }
        $previousResult = 0.0;
        foreach ($column['rule'] as $step) {
            $values = array_map(static function (string $operand) use ($previousResult, $calculated, $accountValue): float {
                if ($operand === 'previousResult') return $previousResult;
                return array_key_exists($operand, $calculated) ? (float)$calculated[$operand] : $accountValue($operand);
            }, $step['operands']);
            $firstValue = $values[0] ?? 0.0;
            $divisor = $values[1] ?? 0.0;
            $previousResult = match ($step['operation']) {
                'add' => array_sum($values),
                'subtract' => $firstValue - array_sum(array_slice($values, 1)),
                'multiply' => $values === [] ? 0.0 : array_product($values),
                'divide' => $divisor == 0.0 ? 0.0 : $firstValue / $divisor,
                default => throw new \LogicException('Unsupported statistics operation: ' . $step['operation']),
            };
        }
        return $previousResult;
    }
}
