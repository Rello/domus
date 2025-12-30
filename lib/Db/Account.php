<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Account extends Entity implements JsonSerializable {
    protected $number;
    protected $labelDe;
    protected $labelEn;
    protected $parentId;
    protected $status;
    protected $isSystem;
    protected $sortOrder;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('parentId', 'int');
        $this->addType('isSystem', 'int');
        $this->addType('sortOrder', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'labelDe' => $this->labelDe,
            'labelEn' => $this->labelEn,
            'parentId' => $this->parentId,
            'status' => $this->status,
            'isSystem' => $this->isSystem,
            'sortOrder' => $this->sortOrder,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
