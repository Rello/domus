<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class TaskStep extends Entity implements JsonSerializable {
    protected $teamId;
    protected $workflowRunId;
    protected $entityType;
    protected $entityId;
    protected $sortOrder;
    protected $title;
    protected $description;
    protected $status;
    protected $dueDate;
    protected $defaultDueDaysOffset;
    protected $deferredUntil;
    protected $openedAt;
    protected $closedAt;
    protected $closedBy;
    protected $allowEarlyCompletion;
    protected $actionType;
    protected $actionUrl;
    protected $createdAt;
    protected $updatedAt;
    protected $runName;
    protected $runStatus;
    protected $templateId;
    protected $templateKey;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('defaultDueDaysOffset', 'int');
        $this->addType('deferredUntil', 'int');
        $this->addType('allowEarlyCompletion', 'int');
        $this->addType('workflowRunId', 'int');
        $this->addType('entityId', 'int');
        $this->addType('sortOrder', 'int');
        $this->addType('openedAt', 'int');
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
            'workflowRunId' => $this->workflowRunId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'sortOrder' => $this->sortOrder,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status,
            'dueDate' => $this->getEffectiveDueDate(),
            'defaultDueDaysOffset' => $this->defaultDueDaysOffset,
            'deferredUntil' => $this->deferredUntil,
            'openedAt' => $this->openedAt,
            'closedAt' => $this->closedAt,
            'closedBy' => $this->closedBy,
            'allowEarlyCompletion' => (bool)$this->allowEarlyCompletion,
            'actionType' => $this->actionType,
            'actionUrl' => $this->actionUrl,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
