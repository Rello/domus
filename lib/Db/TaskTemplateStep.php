<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class TaskTemplateStep extends Entity implements JsonSerializable {
    protected $templateId;
    protected $sortOrder;
    protected $title;
    protected $description;
    protected $defaultDueDaysOffset;
    protected $actionType;
    protected $actionUrl;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('templateId', 'int');
        $this->addType('sortOrder', 'int');
        $this->addType('defaultDueDaysOffset', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'templateId' => $this->templateId,
            'sortOrder' => $this->sortOrder,
            'title' => $this->title,
            'description' => $this->description,
            'defaultDueDaysOffset' => $this->defaultDueDaysOffset,
            'actionType' => $this->actionType,
            'actionUrl' => $this->actionUrl,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
