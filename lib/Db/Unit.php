<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Unit extends Entity implements JsonSerializable {
    protected string $userId = '';
    protected int $propertyId = 0;
    protected string $label = '';
    protected ?string $unitNumber = null;
    protected ?string $landRegister = null;
    protected ?float $livingArea = null;
    protected ?float $usableArea = null;
    protected ?string $unitType = null;
    protected ?string $notes = null;
    protected int $createdAt = 0;
    protected int $updatedAt = 0;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('propertyId', 'integer');
        $this->addType('label', 'string');
        $this->addType('unitNumber', 'string');
        $this->addType('landRegister', 'string');
        $this->addType('livingArea', 'float');
        $this->addType('usableArea', 'float');
        $this->addType('unitType', 'string');
        $this->addType('notes', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'propertyId' => $this->propertyId,
            'label' => $this->label,
            'unitNumber' => $this->unitNumber,
            'landRegister' => $this->landRegister,
            'livingArea' => $this->livingArea,
            'usableArea' => $this->usableArea,
            'unitType' => $this->unitType,
            'notes' => $this->notes,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
