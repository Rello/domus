<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class ActionLog extends Entity implements JsonSerializable {
    protected $userId;
    protected $entityType;
    protected $entityId;
    protected $type;
    protected $title;
    protected $data;
    protected $source;
    protected $linkedEntityType;
    protected $linkedEntityId;
    protected $linkedLabel;
    protected $createdBy;
    protected $createdAt;
    protected $updatedAt;

    private ?string $entityLabel = null;
    private ?string $entityRoute = null;
    private ?array $linkedEntity = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('entityId', 'int');
        $this->addType('linkedEntityId', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'entityLabel' => $this->entityLabel,
            'entityRoute' => $this->entityRoute,
            'type' => $this->type,
            'title' => $this->title,
            'data' => $this->data,
            'source' => $this->source,
            'linkedEntityType' => $this->linkedEntityType,
            'linkedEntityId' => $this->linkedEntityId,
            'linkedLabel' => $this->linkedLabel,
            'linkedEntity' => $this->linkedEntity,
            'createdBy' => $this->createdBy,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }

    public function setEntityLabel(?string $entityLabel): void {
        $this->entityLabel = $entityLabel;
    }

    public function setEntityRoute(?string $entityRoute): void {
        $this->entityRoute = $entityRoute;
    }

    public function setLinkedEntity(?array $linkedEntity): void {
        $this->linkedEntity = $linkedEntity;
    }
}
