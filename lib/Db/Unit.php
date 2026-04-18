<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Unit extends Entity implements JsonSerializable {
    protected $userId;
    protected $propertyId;
    protected $label;
    protected $street;
    protected $zip;
    protected $city;
    protected $country;
    protected $unitNumber;
    protected $landRegister;
    protected $livingArea;
    protected $unitType;
    protected $buyDate;
    protected $totalCosts;
    protected $taxId;
    protected $iban;
    protected $bic;
    protected $notes;
    protected $documentPath;
    protected $imageFileId;
    protected $imageFileName;
    protected $createdAt;
    protected $updatedAt;

    private array $activeTenancies = [];
    private array $historicTenancies = [];
    private ?string $rentPerSquareMeter = null;
    private ?string $propertyName = null;
    private ?string $imageUrl = null;
    private ?string $resolvedImageUrl = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('propertyId', 'int');
        $this->addType('imageFileId', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'propertyId' => $this->propertyId,
            'label' => $this->label,
            'street' => $this->street,
            'zip' => $this->zip,
            'city' => $this->city,
            'country' => $this->country,
            'unitNumber' => $this->unitNumber,
            'landRegister' => $this->landRegister,
            'livingArea' => $this->livingArea,
            'unitType' => $this->unitType,
            'buyDate' => $this->buyDate,
            'totalCosts' => $this->totalCosts,
            'taxId' => $this->taxId,
            'iban' => $this->iban,
            'bic' => $this->bic,
            'notes' => $this->notes,
            'documentPath' => $this->documentPath,
            'imageFileId' => $this->imageFileId,
            'imageFileName' => $this->imageFileName,
            'imageUrl' => $this->imageUrl,
            'resolvedImageUrl' => $this->resolvedImageUrl,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'activeTenancies' => $this->activeTenancies,
            'historicTenancies' => $this->historicTenancies,
            'rentPerSquareMeter' => $this->rentPerSquareMeter,
            'propertyName' => $this->propertyName,
        ];
    }

    public function setActiveTenancies(array $activeTenancies): void {
        $this->activeTenancies = $activeTenancies;
    }

    public function setHistoricTenancies(array $historicTenancies): void {
        $this->historicTenancies = $historicTenancies;
    }

    public function setRentPerSquareMeter(?string $rentPerSquareMeter): void {
        $this->rentPerSquareMeter = $rentPerSquareMeter;
    }

    public function setPropertyName(?string $propertyName): void {
        $this->propertyName = $propertyName;
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
}
