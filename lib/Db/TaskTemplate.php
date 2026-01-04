<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class TaskTemplate extends Entity implements JsonSerializable {
    protected $userId;
    protected $scope;
    protected $propertyId;
    protected $unitId;
    protected $key;
    protected $title;
    protected $description;
    protected $order;
    protected $required;
    protected $enabled;
    protected $triggerType;
    protected $triggerConfig;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('order', 'int');
        $this->addType('required', 'int');
        $this->addType('enabled', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'scope' => $this->scope,
            'propertyId' => $this->propertyId,
            'unitId' => $this->unitId,
            'key' => $this->key,
            'title' => $this->title,
            'description' => $this->description,
            'order' => $this->order,
            'required' => $this->required,
            'enabled' => $this->enabled,
            'triggerType' => $this->triggerType,
            'triggerConfig' => $this->triggerConfig,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
