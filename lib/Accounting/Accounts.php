<?php

namespace OCA\Domus\Accounting;

use OCP\IL10N;

class Accounts {
    private const ACCOUNT_LABELS = [
        '1000' => 'Base rent',
        '1001' => 'Utility costs',
        '2000' => 'Maintenance fee (allocable)',
        '2001' => 'Maintenance fee (non-allocable)',
        '2003' => 'Reserve fund allocation',
        '2004' => 'Other costs',
        '2005' => 'Property tax',
        '2006' => 'Loan interest',
        '2007' => 'Depreciation',
        '2008' => 'Other tax deductions',
        '2009' => 'Tax rate',
        '3000' => 'Total cost',
    ];

    public static function all(?IL10N $l10n = null): array {
        $labels = $l10n ? self::translatedLabels($l10n) : self::ACCOUNT_LABELS;
        $accounts = [];

        foreach (self::ACCOUNT_LABELS as $number => $label) {
            $accounts[$number] = ['label' => $labels[$number] ?? $label];
        }

        return $accounts;
    }

    public static function exists(string $nr): bool {
        return array_key_exists($nr, self::ACCOUNT_LABELS);
    }

    public static function label(string $nr, ?IL10N $l10n = null): string {
        $labels = $l10n ? self::translatedLabels($l10n) : self::ACCOUNT_LABELS;

        return $labels[$nr] ?? '';
    }

    private static function translatedLabels(IL10N $l10n): array {
        return [
            '1000' => $l10n->t('Base rent'),
            '1001' => $l10n->t('Utility costs'),
            '2000' => $l10n->t('Maintenance fee (allocable)'),
            '2001' => $l10n->t('Maintenance fee (non-allocable)'),
            '2003' => $l10n->t('Reserve fund allocation'),
            '2004' => $l10n->t('Other costs'),
            '2005' => $l10n->t('Property tax'),
            '2006' => $l10n->t('Loan interest'),
            '2007' => $l10n->t('Depreciation'),
            '2008' => $l10n->t('Other tax deductions'),
            '2009' => $l10n->t('Tax rate'),
            '3000' => $l10n->t('Total cost'),
        ];
    }
}
