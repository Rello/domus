<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\BookingAssignmentResult;
use PHPUnit\Framework\TestCase;

class BookingAssignmentResultTest extends TestCase {
    public function testPageReferencesComeFromEvidence(): void {
        $data = $this->fixture();
        $data['accounts'][0]['pages'] = [99];
        $text = "[DOMUS PDF PAGE 1 ]\nCover\n[DOMUS PDF PAGE 2 ]\n" . $this->text();
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $text);
        self::assertSame([2], $result['accounts'][0]['pages']);
        self::assertSame([], $result['accounts'][2]['pages']);
        $data['accounts'][0]['source'] = 'Invented evidence';
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $text);
        self::assertSame([], $result['accounts'][0]['pages']);
        $result = (new BookingAssignmentResult())->normalize(json_encode($this->fixture()), $this->text());
        self::assertSame([], $result['accounts'][0]['pages']);
    }
    public function testLiteralWhitespaceInSourceStringsIsAccepted(): void {
        $data = $this->fixture();
        $source = "umlagefähig\tIhr Anteil\n1.939,39";
        $data['accounts'][0]['source'] = $source;
        $json = json_encode($data);
        $json = str_replace(['\\t', '\\n'], ["\t", "\n"], $json);
        $result = (new BookingAssignmentResult())->normalize($json, $this->text());
        self::assertSame($source, $result['accounts'][0]['source']);
        self::assertSame(1939.39, $result['accounts'][0]['amount']);
        self::assertSame('supported', $result['accounts'][0]['confidence']);
    }

    public function testSharedTableHeaderSupportsIndividualSubtotalOnly(): void {
        $data = $this->fixture();
        $data['accounts'][0]['source'] = "Kosten umlagefähig\t28.367,70\t1.939,39";
        $text = $this->text() . "\n[DOMUS PDF PAGE 3 ]\nIhr Anteil Ihr Betrag\n" . $data['accounts'][0]['source'];
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $text);
        self::assertSame('supported', $result['accounts'][0]['confidence']);
        $data['accounts'][0]['amount'] = 28367.70;
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $text);
        self::assertSame('low', $result['accounts'][0]['confidence']);
        $data['accounts'][0]['amount'] = 1939.39;
        foreach (['Ihr Betrag Ihr Anteil', 'Ihr Anteil Ihr Betrag Gesamt', 'Unknown columns'] as $header) {
            $result = (new BookingAssignmentResult())->normalize(json_encode($data), str_replace('Ihr Anteil Ihr Betrag', $header, $text));
            self::assertSame('low', $result['accounts'][0]['confidence']);
        }
    }

    private function fixture(): array {
        return ['period' => ['start' => '2025-01-01', 'end' => '2025-12-31', 'source' => 'Abrechnungsperiode 01.01.2025 - 31.12.2025', 'status' => 'found'], 'accounts' => [
            ['account' => '2000', 'amount' => 1939.39, 'source' => 'umlagefähig Ihr Anteil 1.939,39', 'status' => 'found'],
            ['account' => '2100', 'amount' => 579.48, 'source' => 'nicht umlagefähig Ihr Betrag 579,48', 'status' => 'found'],
            ['account' => '2200', 'amount' => null, 'source' => '', 'status' => 'not_found'],
        ]];
    }
    private function text(): string {
        return "Abrechnungsperiode 01.01.2025 - 31.12.2025\numlagefähig Ihr Anteil\n1.939,39\nnicht umlagefähig Ihr Betrag 579,48\nWirtschaftsplan 2026 Plan 9999\nIst-Zuführung Ihr Anteil 0,00 Soll 500 Bestand 2000 Entnahme 100 Zinsen 20";
    }
    public function testSupportedAmountsAndMissingReserveWithFence(): void {
        $result = (new BookingAssignmentResult())->normalize("```json\n" . json_encode($this->fixture()) . "\n```", $this->text());
        self::assertSame(1939.39, $result['accounts'][0]['amount']);
        self::assertSame('found', $result['accounts'][0]['status']);
        self::assertSame('supported', $result['accounts'][0]['confidence']);
        self::assertSame(579.48, $result['accounts'][1]['amount']);
        self::assertNull($result['accounts'][2]['amount']);
        self::assertSame('not_found', $result['accounts'][2]['status']);
    }
    public function testExplicitZeroIsPreservedAndLegacyBuildingAmountIsOmitted(): void {
        $data = $this->fixture();
        $data['accounts'][2] = ['account'=>'2200','amount'=>0,'buildingAmount'=>500,'source'=>'Ist-Zuführung Ihr Anteil 0,00','status'=>'found'];
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text());
        self::assertSame(0, $result['accounts'][2]['amount']);
        self::assertSame('found', $result['accounts'][2]['status']);
        self::assertArrayNotHasKey('buildingAmount', $result['accounts'][2]);
    }
    public function testUnsupportedEvidenceAndAmbiguousPeriodRequireReview(): void {
        $data = $this->fixture(); $data['accounts'][0]['source'] = 'invented';
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text());
        self::assertSame('needs_review', $result['accounts'][0]['status']);
        $data['period']['status'] = 'needs_review';
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text());
        self::assertSame('needs_review', $result['accounts'][1]['status']);
        $data['period']['start'] = $data['period']['end'] = null;
        $data['period']['source'] = ''; $data['period']['status'] = 'not_found';
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text());
        self::assertSame('not_found', $result['period']['status']);
        self::assertSame('needs_review', $result['accounts'][1]['status']);
    }
    public function testBuildingTotalsAndFabricatedSourcesHaveLowConfidence(): void {
        foreach ([
            ['Gesamtkosten 28.367,70 | Ihr Betrag 1.939,39', 28367.70],
            ['Gesamtkosten 28.367,70', 28367.70],
            ['Ihr Anteil 63,33 %', 63.33],
            ['Ihr Anteil 63,33/1000', 63.33],
            ['Ihr Betrag 1.939,39', 28367.70],
        ] as [$source, $amount]) {
            $data = $this->fixture();
            $data['accounts'][0]['source'] = $source;
            $data['accounts'][0]['amount'] = $amount;
            $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text() . "\n" . $source);
            self::assertSame($data['accounts'][0]['amount'], $result['accounts'][0]['amount']);
            self::assertSame('low', $result['accounts'][0]['confidence']);
            self::assertSame('needs_review', $result['accounts'][0]['status']);
        }
        $data = $this->fixture();
        $data['accounts'][0]['source'] = 'Ihr Beitrag 1.939,39';
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text());
        self::assertSame($data['accounts'][0]['amount'], $result['accounts'][0]['amount']);
        self::assertSame('low', $result['accounts'][0]['confidence']);
        $result = (new BookingAssignmentResult())->normalize(json_encode($data), $this->text() . "\nIhr Beitrag 1.939,39");
        self::assertSame(1939.39, $result['accounts'][0]['amount']);
    }

    public function testRejectsInvalidStructuresDatesAndMoney(): void {
        $cases = ['{"period":', '{}'];
        foreach ([['period','start','2025-02-30'], ['accounts',0,['account'=>'9999']], ['accounts',1,['account'=>'2000']]] as [$group,$key,$value]) {
            $data = $this->fixture(); $data[$group][$key] = $value; $cases[] = json_encode($data);
        }
        foreach (['1939,39', true, 1.234] as $amount) {
            $data = $this->fixture(); $data['accounts'][0]['amount'] = $amount; $cases[] = json_encode($data);
        }
        foreach ($cases as $json) {
            try { (new BookingAssignmentResult())->normalize($json, $this->text()); self::fail('Accepted invalid output'); }
            catch (\JsonException|\UnexpectedValueException $expected) { self::assertNotEmpty($expected->getMessage()); }
        }
    }
}
