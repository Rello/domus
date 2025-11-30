<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Property extends Entity implements JsonSerializable {
    protected string $userId;
    protected string $usageRole;
    protected string $name;
    protected ?string $street = null;
    protected ?string $zip = null;
    protected ?string $city = null;
    protected ?string $country = null;
    protected ?string $type = null;
    protected ?string $description = null;
    protected int $createdAt;
    protected int $updatedAt;

    protected ?int $unitCount = null;
    protected ?float $annualRentSum = null;
    protected ?float $annualResult = null;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('usageRole', 'string');
        $this->addType('name', 'string');
        $this->addType('street', 'string');
        $this->addType('zip', 'string');
        $this->addType('city', 'string');
        $this->addType('country', 'string');
        $this->addType('type', 'string');
        $this->addType('description', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
        $this->addType('unitCount', 'integer');
        $this->addType('annualRentSum', 'float');
        $this->addType('annualResult', 'float');
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
        ];
    }
}
