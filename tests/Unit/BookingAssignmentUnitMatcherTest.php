<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\BookingAssignmentUnitMatcher;
use PHPUnit\Framework\TestCase;
class BookingAssignmentUnitMatcherTest extends TestCase {
    private function unit(int $id, string $number): Unit {
        $unit = new Unit(); $unit->setId($id); $unit->setStreet('Hartmutstraße 4'); $unit->setUnitNumber($number);
        return $unit;
    }
    public function testUniqueStreetNeedsNoUnitNumberAndIgnoresTableWEG(): void {
        $text = "Objekt: Hartmutstr. 4\tAbrechnungsperiode: 01.01.2025 - 31.12.2025\n"
            . "48000 Zufuhr Rücklage WEG\t3.000,00 MEA 839,81 63,33 226,23\n"
            . "Direktkosten Einheit\t218,37\nVerwaltergebühren Einheiten 13,00 1,00\n"
            . "Objekt: Hartmutstr. 4 Abrechnungsperiode: 01.01.2025 - 31.12.2025";
        $result = BookingAssignmentUnitMatcher::inspect($text, [$this->unit(1, '')]);
        self::assertSame(['Hartmutstr. 4'], $result['addresses']);
        self::assertSame([], $result['unitNumbers']);
        self::assertSame(1, $result['unitId']);
        self::assertNull(BookingAssignmentUnitMatcher::match($text, [$this->unit(1, 'DH7'), $this->unit(2, 'DH10')]));
    }

    public function testPaddedUnitNumberAndFloorDescription(): void {
        $a = $this->unit(2, '7'); $a->setStreet('Dürrenhofstr. 47');
        $b = $this->unit(27, '10'); $b->setStreet('Dürrenhofstr. 47');
        $text = "Objekt: 10049, WEG Dürrenhofstr. 47\nWEG Dürrenhofstr. 47\nObjekt. Nr. 10049\nEinheit 3.OG mi 1 Zi\nEinheitennr. 0000010";
        $result = BookingAssignmentUnitMatcher::inspect($text, [$a, $b]);
        self::assertSame(['Dürrenhofstr. 47'], $result['addresses']);
        self::assertSame(['0000010'], $result['unitNumbers']);
        self::assertSame(27, $result['unitId']);
    }

    public function testAddressAndUnitMustMatchUniquely(): void {
        $units = [$this->unit(1, 'DH7'), $this->unit(2, 'DH10')];
        $details = BookingAssignmentUnitMatcher::inspect("Objekt: Hartmutstr. 4, Nürnberg\nEinheit DH99", $units);
        self::assertSame(['Hartmutstr. 4, Nürnberg'], $details['addresses']);
        self::assertSame(['DH99'], $details['unitNumbers']);
        self::assertSame(0, $details['matchCount']);
        self::assertNull($details['unitId']);
        self::assertSame(2, BookingAssignmentUnitMatcher::match("Objekt: Hartmutstr. 4, Nürnberg\nEinheit: DH10", $units));
        self::assertSame(1, BookingAssignmentUnitMatcher::match("WEB Hartmutstr. 4\nEinheit-Nr. DH7", $units));
        self::assertNull(BookingAssignmentUnitMatcher::match("WEG Hartmutstr. 40\nEinheit DH7", $units));
        self::assertNull(BookingAssignmentUnitMatcher::match("Objekt Hartmutstr. 4", $units));
        self::assertNull(BookingAssignmentUnitMatcher::match("Objekt Hartmutstr. 4\nEinheit DH7\nEinheit DH10", $units));
        self::assertNull(BookingAssignmentUnitMatcher::match("Objekt Hartmutstr. 4\nEinheit DH7", [$this->unit(1,'DH7'),$this->unit(2,'DH7')]));
    }
}
