<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

class BookingAssignmentUnitMatcher {
    public static function match(string $text, array $units): ?int {
        return self::inspect($text, $units)['unitId'];
    }

    public static function inspect(string $text, array $units): array {
        $normalize = static function(string $value): string {
            $value = mb_strtolower($value);
            $value = str_replace(['straße', 'strasse', 'str.', 'ß'], ['str', 'str', 'str', 'ss'], $value);
            return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value));
        };
        preg_match_all('/^[ \t]*(?:Objekt|WEG|WEB)[ \t]*:?[ \t]*([^\r\n]+)/imu', $text, $addresses);
        $foundAddresses = [];
        foreach ($addresses[1] as $address) {
            $address = preg_split('/\t|\b(?:Abrechnungsperiode|Abrechnungszeitraum|Wirtschaftsperiode|Vertrag|Einheit|Konto)\s*:/iu', $address, 2)[0];
            $address = preg_replace('/^\d+\s*,\s*(?:WEG|WEB)\s+/iu', '', trim($address));
            if (preg_match('/^(?:[.\s]*Nr\.?\s*)?\d+$/iu', $address)) continue;
            if (preg_match('/\p{L}.*\d/u', $address)) $foundAddresses[] = $address;
        }
        $foundAddresses = array_values(array_unique($foundAddresses));
        $normalizeNumber = static function(string $value): string {
            $value = preg_replace('/\s+/u', '', mb_strtolower($value));
            return ctype_digit($value) ? (ltrim($value, '0') ?: '0') : $value;
        };
        // Floor descriptions such as 'Einheit 3.OG' are not unit identifiers.
        preg_match_all('/^[ \t]*Einheit(?:snummer|en[- ]?Nr\.?|s[- ]?Nr\.?|[- ]?Nr\.?)?\b[ \t]*[:#.-]?[ \t]*([\p{L}]*[ \t]*\d+[\p{L}\d\/-]*)([^\r\n]*)/imu', $text, $numberRows, PREG_SET_ORDER);
        $foundNumbers = [];
        foreach ($numberRows as $row) {
            if (preg_match('/^\s*\.?\s*(?:OG|EG|UG|DG|Obergeschoss|Stock)\b/iu', $row[2])) continue;
            $foundNumbers[] = trim($row[1]);
        }
        $foundNumbers = array_values(array_unique($foundNumbers));
        $numbers = array_unique(array_map($normalizeNumber, $foundNumbers));
        $matches = [];
        foreach ($units as $unit) {
            $street = $normalize((string)$unit->getStreet());
            $number = $normalizeNumber((string)$unit->getUnitNumber());
            if ($street === '') continue;
            foreach ($foundAddresses as $address) {
                if (str_contains(' ' . $normalize($address) . ' ', ' ' . $street . ' ')) {
                    $matches[$unit->getId()] = $number;
                }
            }
        }
        // A unit number is only needed to disambiguate a shared street address.
        if (count($matches) > 1) {
            $matches = array_filter($matches, static fn($number) => $number !== '' && in_array($number, $numbers, true));
        }
        return [
            'unitId' => count($matches) === 1 ? (int)array_key_first($matches) : null,
            'addresses' => $foundAddresses,
            'unitNumbers' => $foundNumbers,
            'matchCount' => count($matches),
        ];
    }
}
