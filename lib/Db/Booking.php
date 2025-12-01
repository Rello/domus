<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Booking extends Entity implements JsonSerializable {
    protected string $userId = '';
    protected ?int $propertyId = null;
    protected ?int $unitId = null;
    protected ?int $tenancyId = null;
    protected string $bookingType = '';
    protected string $category = '';
    protected float $amount = 0.0;
    protected string $date = '';
    protected ?string $description = null;
    protected int $createdAt = 0;
    protected int $updatedAt = 0;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('propertyId', 'integer');
        $this->addType('unitId', 'integer');
        $this->addType('tenancyId', 'integer');
        $this->addType('bookingType', 'string');
        $this->addType('category', 'string');
        $this->addType('amount', 'float');
        $this->addType('date', 'string');
        $this->addType('description', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'propertyId' => $this->propertyId,
            'unitId' => $this->unitId,
            'tenancyId' => $this->tenancyId,
            'bookingType' => $this->bookingType,
            'category' => $this->category,
            'amount' => $this->amount,
            'date' => $this->date,
            'description' => $this->description,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
