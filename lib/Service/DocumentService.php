<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Document;
use OCA\Domus\Db\DocumentMapper;
use OCP\IL10N;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;

class DocumentService {
    public function __construct(
        private DocumentMapper $documentMapper,
        private IRootFolder $rootFolder,
        private IL10N $l10n
    ) {
    }

    /** @return Document[] */
    public function list(string $entityType, int $entityId, string $userId): array {
        $qb = $this->documentMapper->getQueryBuilder();
        $qb->select('*')->from('domus_documents')
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($entityType)))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($entityId)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->documentMapper->findEntities($qb);
    }

    public function create(string $entityType, int $entityId, string $filePath, string $userId): Document {
        if (!$this->pathIsAllowed($filePath, $userId)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid document path.'));
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
        $qb = $this->documentMapper->getQueryBuilder();
        $qb->select('*')->from('domus_documents')
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        $document = $this->documentMapper->findEntity($qb);
        if ($document === null) {
            throw new \RuntimeException($this->l10n->t('Document not found.'));
        }
        $this->documentMapper->delete($document);
    }

    private function pathIsAllowed(string $path, string $userId): bool {
        if (str_contains($path, '..')) {
            return false;
        }
        try {
            $root = $this->rootFolder->getUserFolder($userId);
            $root->get($path);
            return true;
        } catch (NotFoundException $e) {
            return false;
        }
    }
}
