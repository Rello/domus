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
    protected $documentPath;
    protected $imageFileId;
    protected $imageFileName;
    protected $createdAt;
    protected $updatedAt;

    private ?int $unitCount = null;
    private ?int $occupiedUnitCount = null;
    private ?int $vacantUnitCount = null;
    private ?int $activeTenancyCount = null;
    private ?string $annualRentSum = null;
    private ?string $annualResult = null;
    private ?string $imageUrl = null;
    private ?string $resolvedImageUrl = null;
    private array $units = [];
    private array $bookings = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('usageRole', 'string');
        $this->addType('imageFileId', 'int');
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
            'documentPath' => $this->documentPath,
            'imageFileId' => $this->imageFileId,
            'imageFileName' => $this->imageFileName,
            'imageUrl' => $this->imageUrl,
            'resolvedImageUrl' => $this->resolvedImageUrl,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'unitCount' => $this->unitCount,
            'occupiedUnitCount' => $this->occupiedUnitCount,
            'vacantUnitCount' => $this->vacantUnitCount,
            'activeTenancyCount' => $this->activeTenancyCount,
            'annualRentSum' => $this->annualRentSum,
            'annualResult' => $this->annualResult,
            'units' => $this->units,
            'bookings' => $this->bookings,
        ];
    }

    public function setUnitCount(?int $unitCount): void {
        $this->unitCount = $unitCount;
    }

    public function setOccupiedUnitCount(?int $occupiedUnitCount): void {
        $this->occupiedUnitCount = $occupiedUnitCount;
    }

    public function setVacantUnitCount(?int $vacantUnitCount): void {
        $this->vacantUnitCount = $vacantUnitCount;
    }

    public function setActiveTenancyCount(?int $activeTenancyCount): void {
        $this->activeTenancyCount = $activeTenancyCount;
    }

    public function setAnnualRentSum(?string $annualRentSum): void {
        $this->annualRentSum = $annualRentSum;
    }

    public function setAnnualResult(?string $annualResult): void {
        $this->annualResult = $annualResult;
    }

    public function setImageUrl(?string $imageUrl): void {
        $this->imageUrl = $imageUrl;
    }

    public function getImageUrl(): ?string {
        return $this->imageUrl;
    }

    public function setResolvedImageUrl(?string $resolvedImageUrl): void {
        $this->resolvedImageUrl = $resolvedImageUrl;
    }

    public function getResolvedImageUrl(): ?string {
        return $this->resolvedImageUrl;
    }

    public function setUnits(array $units): void {
        $this->units = $units;
    }

    public function setBookings(array $bookings): void {
        $this->bookings = $bookings;
    }
}
