<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Document;
use OCA\Domus\Db\DocumentMapper;
use OCA\Domus\Service\FileService;
use OCP\IL10N;

class DocumentService {
    public function __construct(
        private DocumentMapper $documentMapper,
        private FileService $fileService,
        private IL10N $l10n
    ) {
    }

    /** @return Document[] */
    public function list(string $entityType, int $entityId, string $userId): array {
        return $this->documentMapper->findByEntity($entityType, $entityId, $userId);
    }

    public function create(string $entityType, int $entityId, string $filePath, string $userId, ?string $content = null): Document {
        if ($content !== null) {
            $this->fileService->createFile($filePath, $content, $userId);
        } else {
            $this->fileService->assertPathReadable($filePath, $userId);
        }
        $document = new Document();
        $document->setUserId($userId);
        $document->setEntityType($entityType);
        $document->setEntityId($entityId);
        $document->setFilePath($filePath);
        $document->setCreatedAt(time());
        return $this->documentMapper->insert($document);
    }

    public function delete(int $id, string $userId): void {
        $document = $this->documentMapper->findByIdForUser($id, $userId);
        if ($document === null) {
            throw new \RuntimeException($this->l10n->t('Document not found.'));
        }
        $this->documentMapper->delete($document);
    }
}
