<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\DocxTemplateProcessor;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class DocxTemplateProcessorTest extends TestCase {
    private function processor(): DocxTemplateProcessor {
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(static fn($text, $args = []) => vsprintf($text, $args));
        return new DocxTemplateProcessor($l10n);
    }
    private function xml(string $body): string {
        return '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' . $body . '</w:body></w:document>';
    }
    public function testSplitFieldsPreserveSurroundingTextFormattingAndEscapeValues(): void {
        $xml = $this->xml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Dear ${reci</w:t></w:r><w:r><w:t>pientName}, ${reportYear}: ${recipientName}!</w:t></w:r></w:p>');
        $result = $this->processor()->replaceXml($xml, ['recipientName' => 'Müller & <Sohn>', 'reportYear' => '2025']);
        $doc = new \DOMDocument();
        self::assertTrue($doc->loadXML($result));
        self::assertSame('Dear Müller & <Sohn>, 2025: Müller & <Sohn>!', $doc->documentElement->textContent);
        self::assertStringContainsString('<w:b/>', $result);
        self::assertStringContainsString('&amp; &lt;Sohn&gt;', $result);
    }
    public function testUnknownVariableIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown template variable: senderName');
        $this->processor()->replaceXml($this->xml('<w:p><w:r><w:t>${senderName}</w:t></w:r></w:p>'), []);
    }
    public function testMissingIbanIsRejectedOnlyWhenUsedForGeneration(): void {
        $xml = $this->xml('<w:p><w:r><w:t>${Iban}</w:t></w:r></w:p>');
        $this->processor()->replaceXml($xml, []);
        $this->expectException(\InvalidArgumentException::class);
        $this->processor()->replaceXml($xml, ['Iban' => '']);
    }
    public function testDoctypeIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->processor()->replaceXml('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>', []);
    }
    public function testConditionalParagraphsForPaymentCreditAndZeroBalance(): void {
        $xml = $this->xml(
            '<w:p><w:r><w:t>${ifPay</w:t></w:r><w:r><w:t>mentDue}Pay to ${Iban}.</w:t></w:r></w:p>'
            . '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${ifCredit}Refund follows.</w:t></w:r></w:p>'
            . '<w:p><w:r><w:t>Regards</w:t></w:r></w:p>'
        );
        foreach (['payment', 'credit', 'zero'] as $case) {
            $result = $this->processor()->replaceXml($xml, [
                'ifPaymentDue' => $case === 'payment',
                'ifCredit' => $case === 'credit',
                'Iban' => $case === 'payment' ? 'DE123' : '',
            ]);
            $doc = new \DOMDocument();
            $doc->loadXML($result);
            self::assertSame(match ($case) {
                'payment' => 'Pay to DE123.Regards',
                'credit' => 'Refund follows.Regards',
                'zero' => 'Regards',
            }, $doc->documentElement->textContent);
            self::assertSame($case === 'zero' ? 1 : 2, $doc->getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p')->length);
            self::assertStringNotContainsString('${', $result);
            if ($case === 'credit') self::assertStringContainsString('<w:b/>', $result);
        }
        // Settings validation accepts condition markers without settlement data.
        $this->processor()->replaceXml($xml, []);
        $this->expectException(\InvalidArgumentException::class);
        $this->processor()->replaceXml($xml, ['ifPaymentDue' => true, 'ifCredit' => false, 'Iban' => '']);
    }
    public function testHiddenConditionalParagraphPreservesSectionProperties(): void {
        $section = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
        $xml = $this->xml('<w:p><w:pPr>' . $section . '</w:pPr><w:r><w:t>${ifPaymentDue}Pay ${Iban}</w:t></w:r></w:p><w:p><w:r><w:t>Next section</w:t></w:r></w:p>');
        $result = $this->processor()->replaceXml($xml, ['ifPaymentDue' => false, 'Iban' => '']);
        self::assertStringContainsString($section, $result);
        self::assertStringNotContainsString('${', $result);
        $doc = new \DOMDocument();
        self::assertTrue($doc->loadXML($result));
        self::assertSame('Next section', $doc->documentElement->textContent);
        self::assertSame(2, $doc->getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p')->length);
    }

    public function testHiddenConditionalParagraphsLeaveValidTableCells(): void {
        $paragraph = '<w:p><w:r><w:t>${ifCredit}Refund</w:t></w:r></w:p>';
        $xml = $this->xml('<w:tbl><w:tr><w:tc><w:tcPr/>' . $paragraph . '</w:tc><w:tc>' . $paragraph . $paragraph . '</w:tc></w:tr></w:tbl>');
        $doc = new \DOMDocument();
        self::assertTrue($doc->loadXML($this->processor()->replaceXml($xml, ['ifCredit' => false])));
        $xpath = new \DOMXPath($doc);
        $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        self::assertSame(2, $xpath->query('//w:tc')->length);
        foreach ($xpath->query('//w:tc') as $cell) {
            self::assertSame(1, $xpath->query('./w:p', $cell)->length);
            self::assertSame('', $cell->textContent);
        }
        self::assertSame(1, $xpath->query('//w:tcPr')->length);
    }

    public function testPackagePreservesMediaAndReplacesHeaderAndFooter(): void {
        $path = tempnam(sys_get_temp_dir(), 'template-test-');
        try {
            $zip = new \ZipArchive(); $zip->open($path, \ZipArchive::OVERWRITE);
            $zip->addFromString('[Content_Types].xml', '<Types/>');
            foreach (['document', 'header1', 'footer1'] as $part) {
                $zip->addFromString('word/' . $part . '.xml', $this->xml('<w:p><w:r><w:t>${reportYear}</w:t></w:r></w:p>'));
            }
            $zip->addFromString('word/media/image1.png', 'original image bytes');
            $zip->close();
            $original = file_get_contents($path);
            file_put_contents($path, $this->processor()->render($original, ['reportYear' => '2025']));
            $zip->open($path);
            self::assertSame('original image bytes', $zip->getFromName('word/media/image1.png'));
            foreach (['document', 'header1', 'footer1'] as $part) self::assertStringContainsString('2025', $zip->getFromName('word/' . $part . '.xml'));
            self::assertStringNotContainsString('${reportYear}', $zip->getFromName('word/document.xml'));
            $zip->close();
        } finally { unlink($path); }
    }
    public function testNonDocxArchiveIsRejected(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->processor()->render('not a zip', []);
    }
}
