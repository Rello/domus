<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Strict, side-effect-free primitives shared by financial input paths. */
final class InputValidation {
    public static function date(mixed $value): ?\DateTimeImmutable {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date !== false && $date->format('Y-m-d') === $value && (int)$date->format('Y') > 0 ? $date : null;
    }

    public static function assertDate(mixed $value, string $message): void {
        if (self::date($value) === null) {
            throw new \InvalidArgumentException($message);
        }
    }

    public static function assertMoney(mixed $value, string $message, bool $allowNegative = false): void {
        $pattern = $allowNegative ? '/^-?\d+(?:\.\d{1,2})?$/D' : '/^\d+(?:\.\d{1,2})?$/D';
        if ((!is_string($value) && !is_int($value) && !is_float($value))
            || !preg_match($pattern, (string)$value)
            || !is_finite((float)$value)) {
            throw new \InvalidArgumentException($message);
        }
    }

    public static function assertPeriod(mixed $start, mixed $end, string $message): void {
        self::assertDate($start, $message);
        self::assertDate($end, $message);
        if ($start > $end) {
            throw new \InvalidArgumentException($message);
        }
    }
}
