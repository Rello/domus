<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class PartnerRel extends Entity implements JsonSerializable {
    protected $userId;
    protected $type;
    protected $relationId;
    protected $partnerId;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('relationId', 'int');
        $this->addType('partnerId', 'int');
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
