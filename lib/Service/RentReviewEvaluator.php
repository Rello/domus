<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\Tenancy;

/** Calendar-only evaluation, independent of persistence and task creation. */
class RentReviewEvaluator {
    public function evaluate(Tenancy $tenancy, int $months, \DateTimeImmutable $today, array $history = [], array $references = []): ?array {
        $start = InputValidation::date($tenancy->getStartDate());
        $end = InputValidation::date($tenancy->getEndDate());
        if (!$start || $start > $today || ($end && $end < $today)) return null;
        $since = $this->referenceDate($tenancy, $history, $references);
        $anchor = $since['anchor'];
        $lineage = $since['lineage'];
        $since = $since['date'];
        if (!$since || $since > $today) return ['status' => 'unknown', 'baselineDate' => null, 'dueDate' => null, 'anchor' => $anchor, 'lineage' => $lineage];
        // Clamp month ends: 31 January + one month is the last day of February.
        $month = $since->modify('first day of this month')->modify('+' . $months . ' months');
        $due = $month->setDate((int)$month->format('Y'), (int)$month->format('m'), min((int)$since->format('d'), (int)$month->format('t')));
        return ['status' => $due <= $today ? 'due' : 'ok', 'baselineDate' => $since->format('Y-m-d'), 'dueDate' => $due->format('Y-m-d'), 'anchor' => $anchor, 'lineage' => $lineage];
    }
    /** Use effective-dated rent periods when no explicit reference has been recorded. */
    private function referenceDate(Tenancy $tenancy, array $history, array $references): array {
        $current = $tenancy;
        $visited = [];
        $hasOverride = false;
        $override = null;
        while (true) {
            $id = (int)$current->getId();
            $visited[$id] = true;
            // Confirmed dates belong to the rules module; still trace the occurrence's lineage.
            if (!$hasOverride && array_key_exists($id, $references)) {
                $override = InputValidation::date($references[$id]);
                $hasOverride = true;
            }
            $result = static fn($date) => ['date' => $hasOverride ? $override : $date, 'anchor' => $id, 'lineage' => array_keys($visited)];
            $start = InputValidation::date($current->getStartDate());
            if (!$start) return $result(null);
            $partners = array_map('intval', $current->getPartnerIds());
            sort($partners);
            $previous = array_values(array_filter($history, static function (Tenancy $candidate) use ($current, $start, $partners, $visited): bool {
                if (isset($visited[(int)$candidate->getId()]) || $candidate->getUnitId() !== $current->getUnitId()) return false;
                $end = InputValidation::date($candidate->getEndDate());
                $candidateStart = InputValidation::date($candidate->getStartDate());
                if (!$end || !$candidateStart || $candidateStart >= $start || $end->modify('+1 day') != $start) return false;
                $candidatePartners = array_map('intval', $candidate->getPartnerIds());
                sort($candidatePartners);
                return $partners !== [] && $partners === $candidatePartners;
            }));
            // A new occupancy, gap or ambiguous predecessor starts a new recorded period.
            if (count($previous) !== 1) return $result($start);
            if ((float)$current->getBaseRent() > (float)$previous[0]->getBaseRent()) return $result($start);
            $current = $previous[0];
        }
    }
}
