<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Accounting;

use OCA\Domus\Service\InputValidation;

final class TenancyPeriod {
    /** Calendar-month equivalents, inclusive at both ends and clipped to the year. */
    public static function monthsWithinYear(?string $start, ?string $end, int $year): float {
        $startDate = InputValidation::date($start);
        $endDate = $end ? InputValidation::date($end) : null;
        if ($startDate === null || ($end && $endDate === null)) {
            return 0.0;
        }
        $periodStart = max($startDate, new \DateTimeImmutable(sprintf('%04d-01-01', $year)));
        $periodEnd = min($endDate ?? new \DateTimeImmutable(sprintf('%04d-12-31', $year)), new \DateTimeImmutable(sprintf('%04d-12-31', $year)));
        $months = 0.0;
        for ($month = $periodStart->modify('first day of this month'); $month <= $periodEnd; $month = $month->modify('+1 month')) {
            $from = max($periodStart, $month);
            $to = min($periodEnd, $month->modify('last day of this month'));
            if ($from <= $to) {
                $months += ($from->diff($to)->days + 1) / (int)$month->format('t');
            }
        }
        return $months;
    }
}
