<?php

namespace OCA\Domus\Accounting;

use OCP\IL10N;

class Accounts {
    public static function all(?IL10N $l10n = null): array {
        $labels = self::labels($l10n);
        $accounts = [];

        foreach ($labels as $number => $label) {
            $accounts[$number] = ['label' => $label];
        }

        return $accounts;
    }

    public static function exists(string $nr): bool {
        return array_key_exists($nr, self::labels(null));
    }

    public static function label(string $nr, ?IL10N $l10n = null): string {
        $labels = self::labels($l10n);

        return $labels[$nr] ?? '';
    }

    private static function labels(?IL10N $l10n): array {
        return [
            '1000' => $l10n ? $l10n->t('Base rent') : 'Base rent',
            '1001' => $l10n ? $l10n->t('Utility costs') : 'Utility costs',
            '2000' => $l10n ? $l10n->t('Maintenance fee (allocable)') : 'Maintenance fee (allocable)',
            '2001' => $l10n ? $l10n->t('Maintenance fee (non-allocable)') : 'Maintenance fee (non-allocable)',
            '2003' => $l10n ? $l10n->t('Reserve fund allocation') : 'Reserve fund allocation',
            '2004' => $l10n ? $l10n->t('Other costs') : 'Other costs',
            '2005' => $l10n ? $l10n->t('Property tax') : 'Property tax',
            '2006' => $l10n ? $l10n->t('Loan interest') : 'Loan interest',
            '2007' => $l10n ? $l10n->t('Depreciation') : 'Depreciation',
            '2008' => $l10n ? $l10n->t('Other tax deductions') : 'Other tax deductions',
            '2009' => $l10n ? $l10n->t('Tax rate') : 'Tax rate',
            '3000' => $l10n ? $l10n->t('Total cost') : 'Total cost',
        ];
    }
}
