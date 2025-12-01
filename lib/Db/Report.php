<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Report extends Entity implements JsonSerializable {
    protected string $userId = '';
    protected int $propertyId = 0;
    protected int $year = 0;
    protected string $status = '';
    protected ?string $filePath = null;
    protected ?string $notes = null;
    protected int $createdAt = 0;
    protected int $updatedAt = 0;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('propertyId', 'integer');
        $this->addType('year', 'integer');
        $this->addType('status', 'string');
        $this->addType('filePath', 'string');
        $this->addType('notes', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'propertyId' => $this->propertyId,
            'year' => $this->year,
            'status' => $this->status,
            'filePath' => $this->filePath,
            'notes' => $this->notes,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
