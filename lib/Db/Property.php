<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Property extends Entity implements JsonSerializable {
    protected $userId;
    protected $usageRole;
    protected $name;
    protected $street;
    protected $zip;
    protected $city;
    protected $country;
    protected $type;
    protected $description;
    protected $createdAt;
    protected $updatedAt;

    private ?int $unitCount = null;
    private ?string $annualRentSum = null;
    private ?string $annualResult = null;
    private array $units = [];
    private array $bookings = [];
    private array $reports = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'usageRole' => $this->usageRole,
            'name' => $this->name,
            'street' => $this->street,
            'zip' => $this->zip,
            'city' => $this->city,
            'country' => $this->country,
            'type' => $this->type,
            'description' => $this->description,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'unitCount' => $this->unitCount,
            'annualRentSum' => $this->annualRentSum,
            'annualResult' => $this->annualResult,
            'units' => $this->units,
            'bookings' => $this->bookings,
            'reports' => $this->reports,
        ];
    }

    public function setUnitCount(?int $unitCount): void {
        $this->unitCount = $unitCount;
    }

    public function setAnnualRentSum(?string $annualRentSum): void {
        $this->annualRentSum = $annualRentSum;
    }

    public function setAnnualResult(?string $annualResult): void {
        $this->annualResult = $annualResult;
    }

    public function setUnits(array $units): void {
        $this->units = $units;
    }

    public function setBookings(array $bookings): void {
        $this->bookings = $bookings;
    }

    public function setReports(array $reports): void {
        $this->reports = $reports;
    }
}
