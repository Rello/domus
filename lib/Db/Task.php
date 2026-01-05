<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Task extends Entity implements JsonSerializable {
    protected $unitId;
    protected $title;
    protected $description;
    protected $status;
    protected $dueDate;
    protected $closedAt;
    protected $closedBy;
    protected $createdBy;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('unitId', 'int');
        $this->addType('closedAt', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'unitId' => $this->unitId,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'dueDate' => $this->dueDate,
            'closedAt' => $this->closedAt,
            'closedBy' => $this->closedBy,
            'createdBy' => $this->createdBy,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
