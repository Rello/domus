<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Select complete evidence pages without changing their physical page numbers. */
class BookingAssignmentPageSelector {
    public static function select(string $text): string {
        $pages = preg_split('/(?=\[DOMUS PDF PAGE \d+ \])/', $text, -1, PREG_SPLIT_NO_EMPTY);
        $selected = [];
        $previousMatched = false;
        foreach ($pages as $page) {
            $normalized = mb_strtolower($page);
            $normalized = str_replace(["\u{00AD}", "-\n"], '', $normalized);
            // Only a planning heading excludes a page; incidental references to
            // Wirtschaftsplan in an actual statement must not exclude its costs.
            $header = implode("\n", array_slice(explode("\n", $normalized), 1, 8));
            $header = preg_replace('/[ \t]+/u', '', $header);
            if (preg_match('/^(?:einzel)?wirtschaftsplan\d{4}\s*$/mu', $header)
                || (!str_contains($normalized, 'abrechnungsperiode') && preg_match('/^(?:einzel)?wirtschaftsplan\s*$/mu', $header))) {
                $previousMatched = false;
                continue;
            }
            $costs = preg_match('/umlagef(?:ä|ae)hig/u', $normalized);
            $reserve = preg_match('/r(?:ü|ue)cklag/u', $normalized)
                && preg_match('/zufuhr|zuf(?:ü|ue)hrung|r(?:ü|ue)cklagenzahlungen/u', $normalized);
            // Keep one following table page even if it omits the category keyword.
            $continuation = $previousMatched
                && preg_match('/Ihr\s+(?:Betrag|Beitrag|Anteil)/iu', $page)
                && preg_match('/\d+,\d{2}/u', $page);
            if ($costs || $reserve || $continuation) $selected[] = rtrim($page);
            $previousMatched = (bool)($costs || $reserve);
        }
        // Unknown terminology must not silently remove all document evidence.
        return $selected ? implode("\n", $selected) : $text;
    }
}
