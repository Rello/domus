<?php

namespace OCA\Domus\Accounting;

class StatisticCalculations {
    public static function unit(): array {
        return [
            ['key' => 'year', 'label' => 'year', 'type' => 'year'],
            ['key' => 'rent', 'label' => 'Kaltmiete', 'account' => '1000', 'format' => 'currency'],
            [
                'key' => 'hgnu',
                'label' => 'Nich umlagef.',
                'rule' => [
                    ['op' => 'add', 'args' => ['2001', '2004']],
                ],
                'format' => 'currency',
            ],
            ['key' => 'zinsen', 'label' => 'Kreditzinsen', 'account' => '2006', 'format' => 'currency'],
            [
                'key' => 'gwb',
                'label' => 'Gewinn Brutto',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
                'format' => 'currency',
            ],
            [
                'key' => 'abschr',
                'label' => 'Abschr. & sonstige',
                'rule' => [
                    ['op' => 'add', 'args' => ['2007', '2008']],
                ],
                'format' => 'currency',
            ],
            [
                'key' => 'steuer',
                'label' => 'Steuern',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', '2009']],
                ],
                'format' => 'currency',
            ],
            [
                'key' => 'gwn',
                'label' => 'Gewinn Netto',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'steuer']],
                ],
                'format' => 'currency',
            ],
            [
                'key' => 'netRentab',
                'label' => 'Rentab. Netto',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
                'format' => 'percentage',
            ],
        ];
    }

    public static function unitOverview(): array {
        return [
            ['key' => 'unitId', 'label' => 'Unit ID', 'source' => 'unit', 'field' => 'id', 'visible' => false],
            ['key' => 'label', 'label' => 'Unitlabel', 'source' => 'unit', 'field' => 'label'],
            ['key' => 'size', 'label' => 'Size', 'source' => 'unit', 'field' => 'livingArea', 'format' => 'number', 'unit' => 'm²'],
            ['key' => 'rent', 'label' => 'Kaltmiete', 'account' => '1000', 'format' => 'currency'],
            [
                'key' => 'hgnu',
                'label' => 'Nich umlagef.',
                'rule' => [
                    ['op' => 'add', 'args' => ['2001', '2004']],
                ],
                'visible' => false,
                'format' => 'currency',
            ],
            ['key' => 'zinsen', 'label' => 'Kreditzinsen', 'account' => '2006', 'visible' => false, 'format' => 'currency'],
            [
                'key' => 'gwb',
                'label' => 'Gewinn Brutto',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
                'visible' => false,
                'format' => 'currency',
            ],
            [
                'key' => 'abschr',
                'label' => 'Abschr. & sonstige',
                'rule' => [
                    ['op' => 'add', 'args' => ['2007', '2008']],
                ],
                'visible' => false,
                'format' => 'currency',
            ],
            [
                'key' => 'steuer',
                'label' => 'Steuern',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', '2009']],
                ],
                'visible' => false,
                'format' => 'currency',
            ],
            [
                'key' => 'gwn',
                'label' => 'Gewinn Netto',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'steuer']],
                ],
                'visible' => false,
                'format' => 'currency',
            ],
            [
                'key' => 'rentPerSqm',
                'label' => 'Rent/m²',
                'rule' => [
                    ['op' => 'div', 'args' => ['rent', 'size']],
                ],
                'format' => 'number',
                'unit' => '€/m²',
            ],
            [
                'key' => 'netRentab',
                'label' => 'Rentab. Netto',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
                'format' => 'percentage',
            ],
        ];
    }
}
