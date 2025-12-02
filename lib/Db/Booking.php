<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Booking extends Entity implements JsonSerializable {
    protected $userId;
    protected $bookingType;
    protected $category;
    protected $date;
    protected $amount;
    protected $year;
    protected $propertyId;
    protected $unitId;
    protected $tenancyId;
    protected $description;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('year', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('tenancyId', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'bookingType' => $this->bookingType,
            'category' => $this->category,
            'date' => $this->date,
            'amount' => $this->amount,
            'year' => $this->year,
            'propertyId' => $this->propertyId,
            'unitId' => $this->unitId,
            'tenancyId' => $this->tenancyId,
            'description' => $this->description,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
