<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\App\IAppManager;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IL10N;

/** Keeps the optional Assistant implementation out of ordinary Domus bootstrapping. */
class BookingAssignmentPdfParser {
    /** Parsing needs many times the file size in memory, so larger files are rejected before parsing. */
    public const MAX_BYTES = 10 * 1024 * 1024;

    private ?object $parser = null;

    public function __construct(private IRootFolder $root, private IAppManager $apps, private IL10N $l10n) {}

    /**
     * Domus ships no Composer dependencies. Assistant bundles smalot/pdfparser, which is not a
     * Nextcloud public API, so its presence and method contract are checked before every use.
     */
    protected function assistantParser(): object {
        // Resolving Assistant loads its bundled PDF parser without a Domus dependency.
        \OCP\Server::get('OCA\\Assistant\\Service\\AssistantService');
        return new \Smalot\PdfParser\Parser();
    }

    /** Whether text can be extracted, without touching any file. */
    public function isAvailable(): bool {
        try {
            $this->parser();
            return true;
        } catch (\OCA\Domus\Exception\BookingAssignmentException) {
            return false;
        }
    }

    private function parser(): object {
        if ($this->parser !== null) {
            return $this->parser;
        }
        if (!$this->apps->isEnabledForUser('assistant')) {
            throw $this->unavailable();
        }
        try {
            $parser = $this->assistantParser();
        } catch (\Throwable $e) {
            throw $this->unavailable($e);
        }
        if (!method_exists($parser, 'parseContent')) {
            throw $this->unavailable();
        }
        return $this->parser = $parser;
    }

    private function unavailable(?\Throwable $previous = null): \OCA\Domus\Exception\BookingAssignmentException {
        return new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Assistant PDF parsing is unavailable.'), 0, $previous);
    }

    /** Pages of a parsed document, or null when the bundled parser no longer offers the expected methods. */
    private function pages(object $document): ?array {
        if (!method_exists($document, 'getPages')) {
            return null;
        }
        $pages = $document->getPages();
        if (!is_array($pages)) {
            return null;
        }
        foreach ($pages as $page) {
            if (!is_object($page) || !method_exists($page, 'getText')) {
                return null;
            }
        }
        return array_values($pages);
    }

    public function extract(string $actor, ?string $path, ?array $upload): string {
        $parser = $this->parser();
        // Uploads are parsed from PHP's temporary file and never stored in the user's files.
        $content = $upload !== null ? $this->uploadedContent($upload) : $this->storedContent($actor, (string)($path ?? ''));
        try {
            $document = $parser->parseContent($content);
            $pages = is_object($document) ? $this->pages($document) : null;
        } catch (\Throwable $e) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Unable to read this PDF. Scanned or unsupported PDFs cannot be processed.'), 0, $e);
        }
        // A changed parser API is an unavailable integration, not an unreadable document.
        if ($pages === null) {
            throw $this->unavailable();
        }
        try {
            $parts = [];
            $hasText = false;
            foreach ($pages as $index => $page) {
                $pageText = mb_convert_encoding($page->getText(), 'UTF-8', 'UTF-8');
                $hasText = $hasText || trim($pageText) !== '';
                $parts[] = '[DOMUS PDF PAGE ' . ($index + 1) . " ]\n" . str_replace('[DOMUS PDF PAGE ', '[PDF text ', $pageText);
            }
            $text = $hasText ? implode("\n", $parts) : '';
        } catch (\Throwable $e) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Unable to read this PDF. Scanned or unsupported PDFs cannot be processed.'), 0, $e);
        }
        if (trim($text) === '') {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Select a text PDF. Scanned PDFs are not supported.'));
        }
        return $text;
    }

    private function uploadedContent(array $upload): string {
        $error = $upload['error'] ?? UPLOAD_ERR_NO_FILE;
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            throw $this->tooLarge();
        }
        $temporaryPath = (string)($upload['tmp_name'] ?? '');
        if ($error !== UPLOAD_ERR_OK || !$this->isUploadedFile($temporaryPath)) {
            throw new \InvalidArgumentException($this->l10n->t('PDF upload failed.'));
        }
        $size = filesize($temporaryPath);
        if ($size === false || $size > self::MAX_BYTES) {
            throw $this->tooLarge();
        }
        $content = file_get_contents($temporaryPath);
        if (!is_string($content) || !str_starts_with($content, '%PDF-')) {
            throw new \InvalidArgumentException($this->l10n->t('Select a text PDF. Scanned PDFs are not supported.'));
        }
        return $content;
    }

    protected function isUploadedFile(string $path): bool {
        return is_uploaded_file($path);
    }

    private function storedContent(string $actor, string $path): string {
        $file = $this->root->getUserFolder($actor)->get($path);
        if (!$file instanceof File || !$file->isReadable() || $file->getMimeType() !== 'application/pdf') {
            throw new \InvalidArgumentException($this->l10n->t('Select an accessible PDF file.'));
        }
        if ($file->getSize() > self::MAX_BYTES) {
            throw $this->tooLarge();
        }
        return $file->getContent();
    }

    private function tooLarge(): \InvalidArgumentException {
        return new \InvalidArgumentException($this->l10n->t('Select a PDF of at most 10 MB.'));
    }
}
