<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Tenancy extends Entity implements JsonSerializable {
    protected $userId;
    protected $unitId;
    protected $startDate;
    protected $endDate;
    protected $baseRent;
    protected $serviceCharge;
    protected $deposit;
    protected $conditions;
    protected $createdAt;
    protected $updatedAt;

    protected ?string $status = null;
    protected array $partnerIds = [];
    protected array $partners = [];
    protected ?string $unitLabel = null;
    protected ?string $period = null;
    protected ?string $partnerName = null;
    protected array $bookings = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('unitId', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'unitId' => $this->unitId,
            'startDate' => $this->startDate,
            'endDate' => $this->endDate,
            'baseRent' => $this->baseRent,
            'serviceCharge' => $this->serviceCharge,
            'deposit' => $this->deposit,
            'conditions' => $this->conditions,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'status' => $this->status,
            'partnerIds' => $this->partnerIds,
            'partners' => $this->partners,
            'unitLabel' => $this->unitLabel,
            'period' => $this->period,
            'partnerName' => $this->partnerName,
            'bookings' => $this->bookings,
        ];
    }

    public function setStatus(?string $status): void {
        $this->status = $status;
    }

    public function getStatus(): ?string {
        return $this->status;
    }

    public function setPartnerIds(array $partnerIds): void {
        $this->partnerIds = $partnerIds;
    }

    public function getPartnerIds(): array {
        return $this->partnerIds;
    }

    public function setPartners(array $partners): void {
        $this->partners = $partners;
    }

    public function getPartners(): array {
        return $this->partners;
    }

    public function setUnitLabel(?string $unitLabel): void {
        $this->unitLabel = $unitLabel;
    }

    public function getUnitLabel(): ?string {
        return $this->unitLabel;
    }

    public function setPeriod(?string $period): void {
        $this->period = $period;
    }

    public function getPeriod(): ?string {
        return $this->period;
    }

    public function setPartnerName(?string $partnerName): void {
        $this->partnerName = $partnerName;
    }

    public function getPartnerName(): ?string {
        return $this->partnerName;
    }

    public function setBookings(array $bookings): void {
        $this->bookings = $bookings;
    }

    public function getBookings(): array {
        return $this->bookings;
    }

}
