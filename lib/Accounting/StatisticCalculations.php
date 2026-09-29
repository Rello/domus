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
                'key' => 'rent',
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
                'key' => 'hgnu',
                'label' => 'Non-allocable costs',
                'rule' => [
                    ['op' => 'add', 'args' => ['2100', '2300']],
                ],
            ],
            ['key' => 'zinsen', 'label' => 'Loan interest', 'account' => '2500'],
            [
                'key' => 'gwb',
                'label' => 'Gross profit',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
            ],
            [
                'key' => 'abschr',
                'label' => 'Depreciation & others',
                'rule' => [
                    ['op' => 'add', 'args' => ['2600', '2700']],
                ],
            ],
            [
                'key' => 'steuer',
                'label' => 'Estimated taxes',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', 'taxRate']],
                ],
                'help' => [
                    'title' => 'Estimated taxes',
                    'summary' => 'Calculated with the tax rate shown above the financial table; this is not a settled tax amount.',
                    'calculation' => 'Gross profit minus depreciation and other amounts, multiplied by the configured tax rate.',
                ],
            ],
            [
                'key' => 'gwn',
                'label' => 'Estimated net profit',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'steuer']],
                ],
                'help' => [
                    'title' => 'Estimated net profit',
                    'summary' => 'Gross profit after estimated taxes, not a payment balance.',
                    'calculation' => 'Gross profit minus estimated taxes.',
                ],
            ],
            [
                'key' => 'netRentab',
                'label' => 'Estimated rentability (net)',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
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
            ['key' => 'tenancyUtility', 'label' => 'Utility costs', 'account' => '1001'],
            [
                'key' => 'maintFee',
                'label' => 'Maint. fee (allocable) & property tax',
                'rule' => [
                    ['op' => 'add', 'args' => ['2000', '2400']],
                ],
            ],
            [
                'key' => 'saldo',
                'label' => 'Saldo tenant',
                'rule' => [
                    ['op' => 'sub', 'args' => ['1001', '2000', '2400']],
                ],
            ],
        ];
    }

    public static function unitOverview(): array {
        return [
            ['key' => 'unitId', 'label' => 'Unit ID', 'source' => 'unit', 'field' => 'id', 'visible' => false],
            ['key' => 'label', 'label' => 'Unit', 'source' => 'unit', 'field' => 'label'],
            ['key' => 'size', 'label' => 'Size', 'source' => 'unit', 'field' => 'livingArea', 'format' => 'number', 'unit' => 'm²'],
            ['key' => 'year', 'label' => 'Year', 'type' => 'year'],

            ['key' => 'rent', 'label' => 'Base rent', 'account' => '1000'],
			[
				'key' => 'rentPerSqm',
				'label' => 'Rent/m²',
				'rule' => [
					['op' => 'div', 'args' => ['rent', 'size']],
				],
				'format' => 'number',
				'unit' => '€/m²',
			],            [
                'key' => 'hgnu',
                'label' => 'Non-allocable',
                'rule' => [
                    ['op' => 'add', 'args' => ['2100', '2300']],
                ],
                'visible' => false,
            ],
            ['key' => 'zinsen', 'label' => 'Loan interest', 'account' => '2500', 'visible' => false],
            [
                'key' => 'gwb',
                'label' => 'Gross profit',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
            ],
            [
                'key' => 'abschr',
                'label' => 'Abschr. & sonstige',
                'rule' => [
                    ['op' => 'add', 'args' => ['2600', '2700']],
                ],
                'visible' => false,
            ],
            [
                'key' => 'steuer',
                'label' => 'Estimated taxes',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', 'taxRate']],
                ],
                'visible' => false,
            ],
			[
				'key' => 'gwn',
				'label' => 'Gewinn Netto',
				'rule' => [
					['op' => 'sub', 'args' => ['gwb', 'steuer']],
				],
				'visible' => false,
			],
            [
                'key' => 'netRentab',
                'label' => 'Estimated rentability (net)',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
                'format' => 'percentage',
            ],
        ];
    }
}
