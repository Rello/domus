<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class DocumentLink extends Entity implements JsonSerializable {
    protected $userId;
    protected $entityType;
    protected $entityId;
    protected $filePath;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('entityId', 'int');
        $this->addType('createdAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'filePath' => $this->filePath,
            'createdAt' => $this->createdAt,
        ];
    }
}
