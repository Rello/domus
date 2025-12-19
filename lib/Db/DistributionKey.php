<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class DistributionKey extends Entity implements JsonSerializable {
    protected $userId;
    protected $propertyId;
    protected $type;
    protected $name;
    protected $configJson;
    protected $validFrom;
    protected $validTo;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'propertyId' => $this->propertyId,
            'type' => $this->type,
            'name' => $this->name,
            'configJson' => $this->configJson,
            'validFrom' => $this->validFrom,
            'validTo' => $this->validTo,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
