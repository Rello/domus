<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class WorkflowRun extends Entity implements JsonSerializable {
    protected $unitId;
    protected $templateId;
    protected $name;
    protected $year;
    protected $status;
    protected $startedAt;
    protected $closedAt;
    protected $createdBy;
    protected $createdAt;
    protected $updatedAt;

    private array $steps = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('unitId', 'int');
        $this->addType('templateId', 'int');
        $this->addType('year', 'int');
        $this->addType('startedAt', 'int');
        $this->addType('closedAt', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'unitId' => $this->unitId,
            'templateId' => $this->templateId,
            'name' => $this->name,
            'year' => $this->year,
            'status' => $this->status,
            'startedAt' => $this->startedAt,
            'closedAt' => $this->closedAt,
            'createdBy' => $this->createdBy,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'steps' => $this->steps,
        ];
    }

    public function setSteps(array $steps): void {
        $this->steps = $steps;
    }
}
