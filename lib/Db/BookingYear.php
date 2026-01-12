<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class BookingYear extends Entity implements JsonSerializable {
    protected $propertyId;
    protected $unitId;
    protected $year;
    protected $closedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('year', 'int');
        $this->addType('closedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'propertyId' => $this->propertyId,
            'unitId' => $this->unitId,
            'year' => $this->year,
            'closedAt' => $this->closedAt,
        ];
    }
}
