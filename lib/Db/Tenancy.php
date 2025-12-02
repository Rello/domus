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
    protected $serviceChargeAsPrepayment;
    protected $deposit;
    protected $conditions;
    protected $createdAt;
    protected $updatedAt;

    private ?string $status = null;
    private array $partnerIds = [];
    private array $partners = [];
    private ?string $unitLabel = null;
    private ?string $period = null;
    private ?string $partnerName = null;
    private array $bookings = [];
    private array $reports = [];

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('unitId', 'int');
        $this->addType('serviceChargeAsPrepayment', 'int');
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
            'serviceChargeAsPrepayment' => $this->serviceChargeAsPrepayment,
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
            'reports' => $this->reports,
        ];
    }

    public function setStatus(?string $status): void {
        $this->status = $status;
    }

    public function setPartnerIds(array $partnerIds): void {
        $this->partnerIds = $partnerIds;
    }

    public function setPartners(array $partners): void {
        $this->partners = $partners;
    }

    public function setUnitLabel(?string $unitLabel): void {
        $this->unitLabel = $unitLabel;
    }

    public function setPeriod(?string $period): void {
        $this->period = $period;
    }

    public function setPartnerName(?string $partnerName): void {
        $this->partnerName = $partnerName;
    }

    public function setBookings(array $bookings): void {
        $this->bookings = $bookings;
    }

    public function setReports(array $reports): void {
        $this->reports = $reports;
    }
}
