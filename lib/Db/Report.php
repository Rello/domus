<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Report extends Entity implements JsonSerializable {
    protected $userId;
    protected $year;
    protected $propertyId;
    protected $unitId;
    protected $tenancyId;
    protected $partnerId;
    protected $filePath;
    protected $createdAt;

    private ?string $downloadUrl = null;
    private ?string $propertyName = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('year', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('unitId', 'int');
        $this->addType('tenancyId', 'int');
        $this->addType('partnerId', 'int');
        $this->addType('createdAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'year' => $this->year,
            'propertyId' => $this->propertyId,
            'unitId' => $this->unitId,
            'tenancyId' => $this->tenancyId,
            'partnerId' => $this->partnerId,
            'filePath' => $this->filePath,
            'createdAt' => $this->createdAt,
            'downloadUrl' => $this->downloadUrl,
            'propertyName' => $this->propertyName,
        ];
    }

    public function setDownloadUrl(?string $downloadUrl): void {
        $this->downloadUrl = $downloadUrl;
    }

    public function setPropertyName(?string $propertyName): void {
        $this->propertyName = $propertyName;
    }
}
