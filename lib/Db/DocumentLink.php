<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class DocumentLink extends Entity implements JsonSerializable {
    protected $userId;
    protected $entityType;
    protected $entityId;
    protected $fileId;
    protected $fileName;
    protected $createdAt;

    private ?string $fileUrl = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('entityId', 'int');
        $this->addType('fileId', 'int');
        $this->addType('createdAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'fileId' => $this->fileId,
            'fileName' => $this->fileName,
            'fileUrl' => $this->fileUrl,
            'createdAt' => $this->createdAt,
        ];
    }

    public function setFileUrl(?string $fileUrl): void {
        $this->fileUrl = $fileUrl;
    }
}
