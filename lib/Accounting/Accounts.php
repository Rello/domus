<?php

namespace OCA\Domus\Accounting;

use OCP\IL10N;

class Accounts {
    private const ACCOUNTS = [
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
		$accounts = [];

		foreach (self::ACCOUNTS as $number => $label) {
			$accounts[$number] = ['label' => $l10n ? $l10n->t($label) : $label];
		}

		return $accounts;
	}

    public static function exists(string $nr): bool {
        return array_key_exists($nr, self::ACCOUNTS);
    }

	public static function label(string $nr, ?IL10N $l10n = null): string {
		$label = self::ACCOUNTS[$nr] ?? '';

		return $label !== '' && $l10n ? $l10n->t($label) : $label;
    }
}
