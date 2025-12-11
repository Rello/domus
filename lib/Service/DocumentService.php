<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\DocumentLink;
use OCA\Domus\Db\DocumentLinkMapper;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IL10N;
use OCP\IUploadFile;

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

    public function linkFile(
        string $userId,
        string $entityType,
        int $entityId,
        ?int $fileId = null,
        ?string $path = null
    ): DocumentLink {
        $this->assertEntityType($entityType);

        $node = null;
        if ($fileId !== null) {
            $node = $this->getNodeById($userId, $fileId);
        }
        if ($node === null && $path !== null) {
            $node = $this->getNodeByPath($userId, $path);
        }
        if (!$node) {
            throw new \RuntimeException($this->l10n->t('File not found.'));
        }
        if ($node instanceof Folder) {
            throw new \RuntimeException($this->l10n->t('Please choose a file instead of a folder.'));
        }
        $link = new DocumentLink();
        $link->setUserId($userId);
        $link->setEntityType($entityType);
        $link->setEntityId($entityId);
        $link->setFileId($node->getId());
        $link->setFileName($node->getName());
        $link->setCreatedAt(time());
        return $this->documentLinkMapper->insert($link);
    }

    public function uploadAndLink(
        string $userId,
        string $entityType,
        int $entityId,
        IUploadFile $file,
        ?int $year = null
    ): DocumentLink {
        $this->assertEntityType($entityType);
        $targetFolder = $this->ensureFolderHierarchy($userId, $entityType, $entityId, $year ?? (int)date('Y'));
        $fileName = $this->sanitizeName($file->getName());
        if ($targetFolder->nodeExists($fileName)) {
            $existing = $targetFolder->get($fileName);
            if ($existing instanceof Node) {
                $existing->delete();
            }
        }
        try {
            $node = $targetFolder->newFile($fileName, stream_get_contents($file->getStream()));
        } catch (NotPermittedException $e) {
            throw new \RuntimeException($this->l10n->t('Unable to store the file.'));
        }

        $link = new DocumentLink();
        $link->setUserId($userId);
        $link->setEntityType($entityType);
        $link->setEntityId($entityId);
        $link->setFileId($node->getId());
        $link->setFileName($node->getName());
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

    private function assertEntityType(string $entityType): void {
        if (!in_array($entityType, self::ENTITY_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid entity type.'));
        }
    }

    private function getNodeById(string $userId, int $fileId): ?Node {
        $nodes = $this->rootFolder->getById($fileId);
        foreach ($nodes as $node) {
            if ($node->getOwner()->getUID() === $userId) {
                return $node;
            }
        }
        return null;
    }

    private function getNodeByPath(string $userId, string $path): ?Node {
        $relativePath = ltrim(trim($path), '/');
        if ($relativePath === '' || str_contains($relativePath, '..')) {
            return null;
        }
        try {
            $userFolder = $this->rootFolder->getUserFolder($userId);
            $node = $userFolder->get($relativePath);
            return $node instanceof Node ? $node : null;
        } catch (NotFoundException $e) {
            return null;
        }
    }

    private function ensureFolderHierarchy(string $userId, string $entityType, int $entityId, int $year) {
        $userFolder = $this->rootFolder->getUserFolder($userId);
        $propertyFolderName = $this->sanitizeName('property-' . $entityId);
        $unitFolderName = $this->sanitizeName('unit');

        if (!in_array($entityType, ['property', 'unit', 'tenancy', 'booking'], true)) {
            $propertyFolderName = $this->sanitizeName('general');
        }

        if ($entityType === 'unit') {
            $unitFolderName = $this->sanitizeName('unit-' . $entityId);
        } elseif ($entityType === 'tenancy') {
            $unitFolderName = $this->sanitizeName('tenancy-' . $entityId);
        } elseif ($entityType === 'booking') {
            $unitFolderName = $this->sanitizeName('booking-' . $entityId);
        }

        $propertyFolder = $this->prepareFolder($userFolder, $propertyFolderName);
        $unitFolder = $this->prepareFolder($propertyFolder, $unitFolderName);
        return $this->prepareFolder($unitFolder, (string)$year);
    }

    private function prepareFolder(Folder $parent, string $name): Folder {
        if (!$parent->nodeExists($name)) {
            return $parent->newFolder($name);
        }
        $node = $parent->get($name);
        if ($node instanceof Folder) {
            return $node;
        }
        throw new \RuntimeException($this->l10n->t('Invalid storage folder.'));
    }

    private function sanitizeName(string $name): string {
        $clean = preg_replace('/[\\\/]+/', '-', $name);
        return trim($clean ?: 'document');
    }
}
