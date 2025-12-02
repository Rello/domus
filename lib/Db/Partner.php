<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Partner extends Entity implements JsonSerializable {
    protected $userId;
    protected $partnerType;
    protected $name;
    protected $street;
    protected $zip;
    protected $city;
    protected $country;
    protected $email;
    protected $phone;
    protected $customerRef;
    protected $notes;
    protected $ncUserId;
    protected $createdAt;
    protected $updatedAt;

    private array $tenancies = [];
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
            'partnerType' => $this->partnerType,
            'name' => $this->name,
            'street' => $this->street,
            'zip' => $this->zip,
            'city' => $this->city,
            'country' => $this->country,
            'email' => $this->email,
            'phone' => $this->phone,
            'customerRef' => $this->customerRef,
            'notes' => $this->notes,
            'ncUserId' => $this->ncUserId,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'tenancies' => $this->tenancies,
            'reports' => $this->reports,
        ];
    }

    public function setTenancies(array $tenancies): void {
        $this->tenancies = $tenancies;
    }

    public function setReports(array $reports): void {
        $this->reports = $reports;
    }
}
