<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class TaskStep extends Entity implements JsonSerializable {
    protected $workflowRunId;
    protected $unitId;
    protected $sortOrder;
    protected $title;
    protected $description;
    protected $status;
    protected $dueDate;
    protected $openedAt;
    protected $closedAt;
    protected $closedBy;
    protected $createdAt;
    protected $updatedAt;
    protected $runName;
    protected $runStatus;
    protected $templateId;
    protected $templateKey;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('workflowRunId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('sortOrder', 'int');
        $this->addType('openedAt', 'int');
        $this->addType('closedAt', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'workflowRunId' => $this->workflowRunId,
            'unitId' => $this->unitId,
            'sortOrder' => $this->sortOrder,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'dueDate' => $this->dueDate,
            'openedAt' => $this->openedAt,
            'closedAt' => $this->closedAt,
            'closedBy' => $this->closedBy,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
