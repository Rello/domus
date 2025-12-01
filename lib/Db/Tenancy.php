<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Tenancy extends Entity implements JsonSerializable {
    protected string $userId = '';
    protected int $unitId = 0;
    protected ?int $partnerId = null;
    protected string $startDate = '';
    protected ?string $endDate = null;
    protected float $baseRent = 0.0;
    protected ?float $serviceCharge = null;
    protected bool $serviceChargeAsPrepayment = false;
    protected ?float $deposit = null;
    protected ?string $conditions = null;
    protected ?string $status = null;
    protected int $createdAt = 0;
    protected int $updatedAt = 0;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('userId', 'string');
        $this->addType('unitId', 'integer');
        $this->addType('partnerId', 'integer');
        $this->addType('startDate', 'string');
        $this->addType('endDate', 'string');
        $this->addType('baseRent', 'float');
        $this->addType('serviceCharge', 'float');
        $this->addType('serviceChargeAsPrepayment', 'boolean');
        $this->addType('deposit', 'float');
        $this->addType('conditions', 'string');
        $this->addType('status', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'unitId' => $this->unitId,
            'partnerId' => $this->partnerId,
            'startDate' => $this->startDate,
            'endDate' => $this->endDate,
            'baseRent' => $this->baseRent,
            'serviceCharge' => $this->serviceCharge,
            'serviceChargeAsPrepayment' => $this->serviceChargeAsPrepayment,
            'deposit' => $this->deposit,
            'conditions' => $this->conditions,
            'status' => $this->status,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
