<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Accounting;

/** Exact cent arithmetic for amounts stored as decimal strings. */
final class Money {
    /** Rounds half away from zero, so 0.225 becomes 23 cents. */
    public static function toCents(string|int|float $amount): int {
        if (is_string($amount) && preg_match('/^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/D', $amount, $parts) && ($parts[2] !== '' || ($parts[3] ?? '') !== '')) {
            $fraction = str_pad($parts[3] ?? '', 3, '0');
            $cents = (int)$parts[2] * 100 + (int)substr($fraction, 0, 2) + ((int)$fraction[2] >= 5 ? 1 : 0);
            return $parts[1] === '-' ? -$cents : $cents;
        }
        return (int)round((float)$amount * 100);
    }

    public static function fromCents(int $cents): string {
        $sign = $cents < 0 ? '-' : '';
        $cents = abs($cents);
        return sprintf('%s%d.%02d', $sign, intdiv($cents, 100), $cents % 100);
    }

    /** Negates the stored string as written, so a reversal cancels legacy amounts with more than two decimals. */
    public static function negate(string $amount): string {
        $amount = trim($amount);
        if (!preg_match('/^([+-]?)(\d*(?:\.\d*)?)$/D', $amount, $parts) || trim($parts[2], '.') === '') {
            return self::fromCents(-self::toCents($amount));
        }
        if (trim($parts[2], '0.') === '') {
            return $parts[2];
        }
        return $parts[1] === '-' ? $parts[2] : '-' . $parts[2];
    }

    /**
     * Splits cents proportionally to value / base, rounding each share half away from zero.
     * Multiplying before dividing keeps exact halves such as 60 * 3 / 8 = 22.5 exact.
     */
    public static function share(int $cents, float $value, float $base): int {
        return (int)round($cents * $value / $base);
    }
}
