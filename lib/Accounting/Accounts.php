<?php

namespace OCA\Domus\Accounting;

class Accounts {
    private const ACCOUNTS = [
        '1000' => ['label' => 'Kaltmiete'],
        '1001' => ['label' => 'Nebenkosten'],
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
