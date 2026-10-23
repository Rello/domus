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
    public function __construct(private IRootFolder $root, private IAppManager $apps, private IL10N $l10n) {}

    protected function assistantParser(): object {
        // Resolving Assistant loads its bundled PDF parser without a Domus dependency.
        \OCP\Server::get('OCA\\Assistant\\Service\\AssistantService');
        return new \Smalot\PdfParser\Parser();
    }

    public function extract(string $actor, ?string $path, ?array $upload): string {
        if (!$this->apps->isEnabledForUser('assistant')) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Assistant PDF parsing is unavailable.'));
        }
        try {
            $parser = $this->assistantParser();
        } catch (\Throwable $e) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Assistant PDF parsing is unavailable.'), 0, $e);
        }
        $temporary = null;
        try {
            $folder = $this->root->getUserFolder($actor);
            if ($upload !== null) {
                if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'] ?? '')) {
                    throw new \InvalidArgumentException($this->l10n->t('PDF upload failed.'));
                }
                $content = file_get_contents($upload['tmp_name']);
                if (!is_string($content) || !str_starts_with($content, '%PDF-')) {
                    throw new \InvalidArgumentException($this->l10n->t('Select a text PDF. Scanned PDFs are not supported.'));
                }
                $temporary = $folder->newFile('.domus-preview-' . bin2hex(random_bytes(16)) . '.pdf', $content);
                $file = $temporary;
            } else {
                $file = $folder->get($path ?? '');
            }
            if (!$file instanceof File || !$file->isReadable() || $file->getMimeType() !== 'application/pdf') {
                throw new \InvalidArgumentException($this->l10n->t('Select an accessible PDF file.'));
            }
            try {
                $pages = $parser->parseContent($file->getContent())->getPages();
                $parts = [];
                $hasText = false;
                foreach (array_values($pages) as $index => $page) {
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
        } finally {
            $temporary?->delete();
        }
    }
}
