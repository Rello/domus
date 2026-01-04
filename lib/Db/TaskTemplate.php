<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class TaskTemplate extends Entity implements JsonSerializable {
    protected $key;
    protected $name;
    protected $description;
    protected $appliesTo;
    protected $isActive;
    protected $userId;
    protected $createdAt;
    protected $updatedAt;

    private array $steps = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('isActive', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            'appliesTo' => $this->appliesTo,
            'isActive' => (bool)$this->isActive,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'steps' => $this->steps,
        ];
    }

    public function setSteps(array $steps): void {
        $this->steps = $steps;
    }
}
