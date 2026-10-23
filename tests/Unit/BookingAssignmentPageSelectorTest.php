<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\BookingAssignmentPageSelector;
use PHPUnit\Framework\TestCase;

class BookingAssignmentPageSelectorTest extends TestCase {
    public function testSelectsCostsAndContributionsButNotPlanningHeadings(): void {
        $pages = [
            "[DOMUS PDF PAGE 1 ]\nInvitation",
            "[DOMUS PDF PAGE 3 ]\nAbrechnungsperiode 2025\nKosten nichtumlagefähig 500 50",
            "[DOMUS PDF PAGE 4 ]\nAbrechnung\nZufuhr Rücklage WEG 3000 226\ngem. Wirtschaftsplan",
            "[DOMUS PDF PAGE 9 ]\nRücklagenzahlungen (Ist) 226,20",
            "[DOMUS PDF PAGE 12 ]\nW I R T S C H A F T S P L A N 2027\numlagefähig\nZuführung Rücklage",
            "[DOMUS PDF PAGE 13 ]\nRücklage Endstand 1000",
        ];
        self::assertSame(implode("\n", array_slice($pages, 1, 3)), BookingAssignmentPageSelector::select(implode("\n", $pages)));
    }
    public function testRetainsContinuationSubtotalWithRepeatedHeader(): void {
        $text = "[DOMUS PDF PAGE 2 ]\nKosten nicht umlagefähige Beträge\nIhr Betrag\nReparatur 123,75\n"
            . "[DOMUS PDF PAGE 3 ]\nIhr Anteil Ihr Betrag\nBankgebühren 5,65\nIV. Zwischensumme 515,37\n"
            . "[DOMUS PDF PAGE 4 ]\nInvitation";
        $selected = BookingAssignmentPageSelector::select($text);
        self::assertStringContainsString('IV. Zwischensumme 515,37', $selected);
        self::assertStringNotContainsString('Invitation', $selected);
    }

    public function testUnknownTerminologyFallsBackToOriginalText(): void {
        $text = "[DOMUS PDF PAGE 1 ]\nAnnual costs 100";
        self::assertSame($text, BookingAssignmentPageSelector::select($text));
    }
    public function testUmlautAlternativesAndHyphenatedWords(): void {
        $text = "[DOMUS PDF PAGE 2 ]\nNicht umlagefaehige Kosten\n[DOMUS PDF PAGE 4 ]\nZufuehrung Erhaltungsruecklage";
        self::assertStringContainsString('[DOMUS PDF PAGE 4 ]', BookingAssignmentPageSelector::select($text));
    }
}
