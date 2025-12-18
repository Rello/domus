<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class DistributionKeyUnit extends Entity implements JsonSerializable {
    protected $userId;
    protected $distributionKeyId;
    protected $unitId;
    protected $value;
    protected $validFrom;
    protected $validTo;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('distributionKeyId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('value', 'float');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'distributionKeyId' => $this->distributionKeyId,
            'unitId' => $this->unitId,
            'value' => $this->value,
            'validFrom' => $this->validFrom,
            'validTo' => $this->validTo,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
