<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IL10N;

class DocumentTemplateService {
    private const KEY = 'utilityReportTemplate';
    public function __construct(
        private PortfolioSettingsService $settings,
        private IRootFolder $rootFolder,
        private ManagementAccessContext $access,
        private DocxTemplateProcessor $processor,
        private IL10N $l10n,
    ) {}

    private function file(int $id): File {
        foreach ($this->rootFolder->getUserFolder($this->access->actorUserId())->getById($id) as $file) {
            if ($file instanceof File && $file->isReadable()) return $file;
        }
        throw new \InvalidArgumentException($this->l10n->t('The assigned template is missing or inaccessible.'));
    }

    private function content(File $file): string {
        if (strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION)) !== 'docx' || $file->getSize() > 10 * 1024 * 1024) {
            throw new \InvalidArgumentException($this->l10n->t('Select a valid DOCX template (maximum 10 MB).'));
        }
        return $file->getContent();
    }

    public function status(string $userId): array {
        $id = (int)$this->settings->getValue($userId, self::KEY, '0');
        if (!$id) return ['fileId' => null, 'name' => '', 'ready' => false, 'error' => $this->l10n->t('No document template configured.')];
        $name = '';
        try {
            $file = $this->file($id);
            $name = $file->getName();
            $this->processor->render($this->content($file), []);
            return ['fileId' => $id, 'name' => $file->getName(), 'ready' => true, 'error' => ''];
        } catch (\InvalidArgumentException $e) {
            return ['fileId' => $id, 'name' => $name, 'ready' => false, 'error' => $e->getMessage()];
        } catch (\OCP\Files\NotFoundException|\OCP\Files\NotPermittedException|\OCP\Files\GenericFileException|\OCP\Lock\LockedException $e) {
            // Keep Settings available so a broken assignment can be replaced or
            // removed. Do not expose storage paths from the original exception.
            return ['fileId' => $id, 'name' => $name, 'ready' => false,
                'error' => $this->l10n->t('The assigned template is missing or inaccessible.')];
        }
    }

    public function assign(string $userId, string $path): void {
        if (trim($path) === '') {
            $this->settings->setValue($userId, self::KEY, '0');
            return;
        }
        try {
            $file = $this->rootFolder->getUserFolder($this->access->actorUserId())->get(ltrim($path, '/'));
        } catch (\OCP\Files\NotFoundException $e) {
            throw new \InvalidArgumentException($this->l10n->t('The assigned template is missing or inaccessible.'));
        }
        if (!$file instanceof File || !$file->isReadable()) {
            throw new \InvalidArgumentException($this->l10n->t('The assigned template is missing or inaccessible.'));
        }
        $this->processor->render($this->content($file), []);
        $this->settings->setValue($userId, self::KEY, (string)$file->getId());
    }

    public function render(string $userId, array $values): string {
        $id = (int)$this->settings->getValue($userId, self::KEY, '0');
        if (!$id) throw new \InvalidArgumentException($this->l10n->t('No document template configured.'));
        return $this->processor->render($this->content($this->file($id)), $values);
    }
}
