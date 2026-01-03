<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class UnitTask extends Entity implements JsonSerializable {
    protected $userId;
    protected $unitId;
    protected $year;
    protected $templateId;
    protected $status;
    protected $dueDate;
    protected $completedAt;
    protected $dataJson;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('unitId', 'int');
        $this->addType('year', 'int');
        $this->addType('templateId', 'int');
        $this->addType('completedAt', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'unitId' => $this->unitId,
            'year' => $this->year,
            'templateId' => $this->templateId,
            'status' => $this->status,
            'dueDate' => $this->dueDate,
            'completedAt' => $this->completedAt,
            'dataJson' => $this->dataJson,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
