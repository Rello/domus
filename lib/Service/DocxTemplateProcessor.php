<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\IL10N;

/** Replaces scalar fields without rebuilding the document's layout or media. */
class DocxTemplateProcessor {
    public const VARIABLES = ['documentDate', 'recipientName', 'recipientStreet', 'recipientPostalCode',
        'recipientCity', 'reportYear', 'unitStreet', 'prepaymentAmount', 'utilityCostAmount',
        'propertyTaxAmount', 'balanceLabel', 'balanceAmount', 'Iban'];
    private const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    private const CONDITIONS = ['ifPaymentDue', 'ifCredit'];

    public function __construct(private IL10N $l10n) {}

    public function render(string $content, array $values): string {
        if (!class_exists(\ZipArchive::class) || !class_exists(\DOMDocument::class)) {
            throw new \InvalidArgumentException($this->l10n->t('DOCX templates require the PHP ZIP and XML extensions.'));
        }
        $path = tempnam(sys_get_temp_dir(), 'domus-docx-');
        if ($path === false) throw new \RuntimeException('Unable to create temporary document.');
        $zip = new \ZipArchive();
        $opened = false;
        try {
            if (strlen($content) > 10 * 1024 * 1024 || file_put_contents($path, $content) === false || $zip->open($path) !== true) {
                throw new \InvalidArgumentException($this->l10n->t('Select a valid DOCX template (maximum 10 MB).'));
            }
            $opened = true;
            if ($zip->locateName('word/document.xml') === false || $zip->locateName('[Content_Types].xml') === false) {
                throw new \InvalidArgumentException($this->l10n->t('Select a valid DOCX template (maximum 10 MB).'));
            }
            $total = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $total += $stat['size'];
                if ($total > 50 * 1024 * 1024 || $zip->numFiles > 2000) {
                    throw new \InvalidArgumentException($this->l10n->t('Select a valid DOCX template (maximum 10 MB).'));
                }
            }
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if (!preg_match('~^word/(document|header[0-9]+|footer[0-9]+)\.xml$~', $name)) continue;
                $xml = $zip->getFromName($name);
                $zip->addFromString($name, $this->replaceXml($xml, $values));
            }
            if (!$zip->close()) throw new \RuntimeException('Unable to save document.');
            $opened = false;
            $result = file_get_contents($path);
            if ($result === false) throw new \RuntimeException('Unable to read document.');
            return $result;
        } finally {
            if ($opened) $zip->close();
            unlink($path);
        }
    }

    public function replaceXml(string $xml, array $values): string {
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            if (!$doc->loadXML($xml, LIBXML_NONET) || $doc->doctype !== null) {
                throw new \InvalidArgumentException($this->l10n->t('The DOCX template contains invalid XML.'));
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xpath = new \DOMXPath($doc);
        $xpath->registerNamespace('w', self::NS);
        foreach ($xpath->query('//w:p') as $paragraph) {
            // Do not join text across paragraphs (including nested text boxes).
            $nodes = [];
            $text = '';
            foreach ($xpath->query('.//w:t', $paragraph) as $node) {
                if ($xpath->query('ancestor::w:p[1]', $node)->item(0) !== $paragraph) continue;
                $nodes[] = ['node' => $node, 'start' => strlen($text), 'length' => strlen($node->textContent)];
                $text .= $node->textContent;
            }
            preg_match_all('/\$\{([^{}]+)\}/u', $text, $matches, PREG_OFFSET_CAPTURE);
            foreach ($matches[1] as [$key]) {
                if (!in_array($key, self::VARIABLES, true) && !in_array($key, self::CONDITIONS, true)) {
                    throw new \InvalidArgumentException($this->l10n->t('Unknown template variable: %s', [$key]));
                }
            }
            // A condition applies to its entire paragraph, before evaluating fields such as IBAN.
            foreach (self::CONDITIONS as $condition) {
                if (str_contains($text, '${' . $condition . '}') && array_key_exists($condition, $values) && !$values[$condition]) {
                    $this->removeConditionalParagraph($paragraph, $xpath);
                    continue 2;
                }
            }
            // Work backwards so offsets for earlier placeholders remain valid.
            for ($m = count($matches[0]) - 1; $m >= 0; $m--) {
                [$token, $start] = $matches[0][$m];
                $key = $matches[1][$m][0];
                $value = in_array($key, self::CONDITIONS, true) ? '' : (string)($values[$key] ?? '');
                if ($key === 'Iban' && array_key_exists($key, $values) && trim($value) === '') {
                    throw new \InvalidArgumentException($this->l10n->t('Enter an IBAN in the unit before using this template.'));
                }
                $end = $start + strlen($token);
                foreach ($nodes as $part) {
                    $a = $part['start'];
                    $b = $a + $part['length'];
                    if ($a >= $end || $b <= $start) continue;
                    $node = $part['node'];
                    $prefix = substr($node->textContent, 0, max(0, $start - $a));
                    $suffix = substr($node->textContent, min($part['length'], $end - $a));
                    $node->textContent = $prefix . ($a <= $start ? $value : '') . $suffix;
                    $node->setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
                }
            }
        }
        return $doc->saveXML();
    }

    private function removeConditionalParagraph(\DOMElement $paragraph, \DOMXPath $xpath): void {
        $hasSection = $xpath->query('./w:pPr/w:sectPr', $paragraph)->length > 0;
        // Keep the final paragraph in a table cell, including when all its
        // paragraphs are conditional. A cell must retain a paragraph.
        $isLastCellParagraph = $xpath->query('parent::w:tc', $paragraph)->length > 0
            && $xpath->query('following-sibling::w:p', $paragraph)->length === 0;
        if (!$hasSection && !$isLastCellParagraph) {
            $paragraph->parentNode->removeChild($paragraph);
            return;
        }
        // The empty paragraph carries the section break and/or cell structure;
        // remove its content while preserving paragraph and section properties.
        foreach (iterator_to_array($paragraph->childNodes) as $child) {
            if ($child->namespaceURI !== self::NS || $child->localName !== 'pPr') {
                $paragraph->removeChild($child);
            }
        }
    }
}
