<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Partner extends Entity implements JsonSerializable {
    protected string $userId;
    protected string $partnerType;
    protected string $name;
    protected ?string $street = null;
    protected ?string $zip = null;
    protected ?string $city = null;
    protected ?string $country = null;
    protected ?string $email = null;
    protected ?string $phone = null;
    protected ?string $customerRef = null;
    protected ?string $notes = null;
    protected ?string $ncUserId = null;
    protected int $createdAt;
    protected int $updatedAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('partnerType', 'string');
        $this->addType('name', 'string');
        $this->addType('street', 'string');
        $this->addType('zip', 'string');
        $this->addType('city', 'string');
        $this->addType('country', 'string');
        $this->addType('email', 'string');
        $this->addType('phone', 'string');
        $this->addType('customerRef', 'string');
        $this->addType('notes', 'string');
        $this->addType('ncUserId', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
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
        ];
    }
}
