<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Booking extends Entity implements JsonSerializable {
    protected $userId;
    protected $account;
    protected $date;
    protected $amount;
    protected $year;
    protected $propertyId;
    protected $unitId;
    protected $tenancyId;
    protected $description;
    protected $createdAt;
    protected $updatedAt;

    public function getBookingType(): ?string {
        // Legacy compatibility: bookingType was removed but older code paths may still call the getter.
        // Return null to avoid runtime errors while keeping the simplified account-based model intact.
        return null;
    }

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('account', 'int');
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
            'account' => $this->account,
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
