<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Task extends Entity implements JsonSerializable {
    protected $deferredUntil;
    protected $ruleId;
    protected $ruleTenancyId;
    protected $teamId;
    protected $entityType;
    protected $entityId;
    protected $title;
    protected $description;
    protected $status;
    protected $dueDate;
    protected $closedAt;
    protected $closedBy;
    protected $createdBy;
    protected $createdAt;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'int');
        foreach (['deferredUntil', 'ruleId', 'ruleTenancyId'] as $field) $this->addType($field, 'int');
        $this->addType('entityId', 'int');
        $this->addType('closedAt', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function getEffectiveDueDate(): ?string {
        return $this->deferredUntil !== null ? date('Y-m-d', $this->deferredUntil) : $this->dueDate;
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'deferredUntil' => $this->deferredUntil,
            'ruleId' => $this->ruleId,
            'ruleTenancyId' => $this->ruleTenancyId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'dueDate' => $this->getEffectiveDueDate(),
            'closedAt' => $this->closedAt,
            'closedBy' => $this->closedBy,
            'createdBy' => $this->createdBy,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
