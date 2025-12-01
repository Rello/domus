<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\DocumentLink;
use OCA\Domus\Db\DocumentLinkMapper;
use OCP\Files\IRootFolder;
use OCP\IL10N;

class DocumentService {
    private const ENTITY_TYPES = ['property', 'unit', 'partner', 'tenancy', 'booking', 'report'];

    public function __construct(
        private DocumentLinkMapper $documentLinkMapper,
        private IRootFolder $rootFolder,
        private IL10N $l10n,
    ) {
    }

    public function listForEntity(string $userId, string $entityType, int $entityId): array {
        $this->assertEntityType($entityType);
        return $this->documentLinkMapper->findForEntity($userId, $entityType, $entityId);
    }

    public function linkFile(string $userId, string $entityType, int $entityId, string $filePath): DocumentLink {
        $this->assertEntityType($entityType);
        $normalizedPath = $this->normalizePath($filePath);
        $userFolder = $this->rootFolder->getUserFolder($userId);
        if (!$userFolder->nodeExists($normalizedPath)) {
            throw new \RuntimeException($this->l10n->t('File not found.'));
        }
        $link = new DocumentLink();
        $link->setUserId($userId);
        $link->setEntityType($entityType);
        $link->setEntityId($entityId);
        $link->setFilePath($normalizedPath);
        $link->setCreatedAt(time());
        return $this->documentLinkMapper->insert($link);
    }

    public function unlink(string $userId, int $id): void {
        $link = $this->documentLinkMapper->findForUser($id, $userId);
        if (!$link) {
            throw new \RuntimeException($this->l10n->t('Document link not found.'));
        }
        $this->documentLinkMapper->delete($link);
    }

    private function normalizePath(string $path): string {
        $trimmed = ltrim($path, '/');
        if (str_contains($trimmed, '../')) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid file path.'));
        }
        return $trimmed;
    }

    private function assertEntityType(string $entityType): void {
        if (!in_array($entityType, self::ENTITY_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid entity type.'));
        }
    }
}
