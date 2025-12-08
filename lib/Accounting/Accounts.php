<?php

namespace OCA\Domus\Accounting;

class Accounts {
    private const ACCOUNTS = [
        '1000' => ['label' => 'Kaltmiete'],
        '1001' => ['label' => 'Nebenkosten'],
		'2000' => ['label' => 'Hausgeld umlagefägig'],
		'2001' => ['label' => 'Hausgelt n. umlagefähig'],
		'2003' => ['label' => 'Zuführ. Rücklage'],
		'2004' => ['label' => 'Sonstige Kosten'],
		'2005' => ['label' => 'Grundsteuer'],
		'2006' => ['label' => 'Kreditzinsen'],
		'2007' => ['label' => 'Abschreibung'],
		'2008' => ['label' => 'Sonstige Steuerabzüge'],
		'2009' => ['label' => 'Steuersatz'],
    ];

    public static function all(): array {
        return self::ACCOUNTS;
    }

    public static function exists(string $nr): bool {
        return array_key_exists($nr, self::ACCOUNTS);
    }

    public static function label(string $nr): string {
        return self::ACCOUNTS[$nr]['label'] ?? '';
    }
}
