<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class PartnerRel extends Entity implements JsonSerializable {
    protected string $userId;
    protected string $type;
    protected int $relationId;
    protected int $partnerId;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('type', 'string');
        $this->addType('relationId', 'integer');
        $this->addType('partnerId', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'type' => $this->type,
            'relationId' => $this->relationId,
            'partnerId' => $this->partnerId,
        ];
    }
}
