<?php

namespace OCA\Domus\Accounting;

class StatisticCalculations {
    public static function unitRevenue(): array {
        return [
            ['key' => 'year', 'label' => 'Year', 'type' => 'year'],
            ['key' => 'rent', 'label' => 'Base rent', 'account' => '1000'],
            [
                'key' => 'hgnu',
                'label' => 'Maintenance fee (non-allocable)',
                'rule' => [
                    ['op' => 'add', 'args' => ['2001', '2004']],
                ],
            ],
            ['key' => 'zinsen', 'label' => 'Loan interest', 'account' => '2006'],
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
                    ['op' => 'add', 'args' => ['2007', '2008']],
                ],
            ],
            [
                'key' => 'steuer',
                'label' => 'Taxes',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', 'taxRate']],
                ],
            ],
            [
                'key' => 'gwn',
                'label' => 'Net profit',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'steuer']],
                ],
            ],
            [
                'key' => 'netRentab',
                'label' => 'Rentability',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
                'format' => 'percentage',
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
                    ['op' => 'add', 'args' => ['2000', '2005']],
                ],
            ],
            [
                'key' => 'saldo',
                'label' => 'Saldo tenant',
                'rule' => [
                    ['op' => 'sub', 'args' => ['1001', '2000', '2005']],
                ],
            ],
        ];
    }

    public static function unitOverview(): array {
        return [
            ['key' => 'unitId', 'label' => 'Unit ID', 'source' => 'unit', 'field' => 'id', 'visible' => false],
            ['key' => 'label', 'label' => 'Unit', 'source' => 'unit', 'field' => 'label'],
            ['key' => 'size', 'label' => 'Size', 'source' => 'unit', 'field' => 'livingArea', 'format' => 'number', 'unit' => 'm²'],

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
                    ['op' => 'add', 'args' => ['2001', '2004']],
                ],
                'visible' => false,
            ],
            ['key' => 'zinsen', 'label' => 'Loan interest', 'account' => '2006', 'visible' => false],
            [
                'key' => 'abschr',
                'label' => 'Abschr. & sonstige',
                'rule' => [
                    ['op' => 'add', 'args' => ['2007', '2008']],
                ],
                'visible' => false,
            ],
            [
                'key' => 'steuer',
                'label' => 'Taxes',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', 'taxRate']],
                ],
                'visible' => false,
            ],
            [
                'key' => 'gwb',
                'label' => 'Gross profit',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
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
                'label' => 'Rentability',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwb', '3000']],
                ],
                'format' => 'percentage',
            ],
        ];
    }
}
