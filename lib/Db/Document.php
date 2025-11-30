<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Document extends Entity implements JsonSerializable {
    protected string $userId;
    protected string $entityType;
    protected int $entityId;
    protected string $filePath;
    protected int $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('entityType', 'string');
        $this->addType('entityId', 'integer');
        $this->addType('filePath', 'string');
        $this->addType('createdAt', 'integer');
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
