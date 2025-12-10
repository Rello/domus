<?php

namespace OCA\Domus\Accounting;

class StatisticCalculations {
    public static function unit(): array {
        return [
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
                'key' => 'netRentab',
                'label' => 'Rentab. Netto',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
            ],
        ];
    }

    public static function unitOverview(): array {
        return [
            ['key' => 'unitId', 'label' => 'Unit ID', 'source' => 'unit', 'field' => 'id', 'visible' => false],
            ['key' => 'label', 'label' => 'Unitlabel', 'source' => 'unit', 'field' => 'label'],
            ['key' => 'size', 'label' => 'Size', 'source' => 'unit', 'field' => 'livingArea'],
            ['key' => 'rent', 'label' => 'Kaltmiete', 'account' => '1000'],
            [
                'key' => 'hgnu',
                'label' => 'Nich umlagef.',
                'rule' => [
                    ['op' => 'add', 'args' => ['2001', '2004']],
                ],
                'visible' => false,
            ],
            ['key' => 'zinsen', 'label' => 'Kreditzinsen', 'account' => '2006', 'visible' => false],
            [
                'key' => 'gwb',
                'label' => 'Gewinn Brutto',
                'rule' => [
                    ['op' => 'sub', 'args' => ['rent', 'hgnu']],
                    ['op' => 'sub', 'args' => ['prev', 'zinsen']],
                ],
                'visible' => false,
            ],
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
                'label' => 'Steuern',
                'rule' => [
                    ['op' => 'sub', 'args' => ['gwb', 'abschr']],
                    ['op' => 'mul', 'args' => ['prev', '2009']],
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
                'key' => 'rentPerSqm',
                'label' => 'Rent/m²',
                'rule' => [
                    ['op' => 'div', 'args' => ['rent', 'size']],
                ],
                'format' => 'number',
            ],
            [
                'key' => 'netRentab',
                'label' => 'Rentab. Netto',
                'rule' => [
                    ['op' => 'div', 'args' => ['gwn', '3000']],
                ],
            ],
        ];
    }
}
