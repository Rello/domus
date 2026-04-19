<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class DocumentLink extends Entity implements JsonSerializable {
    protected $userId;
    protected $entityType;
    protected $entityId;
    protected $fileId;
    protected $fileName;
    protected $createdAt;

    private ?string $fileUrl = null;
    private ?string $filePath = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('entityId', 'int');
        $this->addType('fileId', 'int');
        $this->addType('createdAt', 'int');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'entityType' => $this->entityType,
            'entityId' => $this->entityId,
            'fileId' => $this->fileId,
            'fileName' => $this->fileName,
            'fileUrl' => $this->fileUrl,
            'filePath' => $this->filePath,
            'createdAt' => $this->createdAt,
        ];
    }

    public function setFileUrl(?string $fileUrl): void {
        $this->fileUrl = $fileUrl;
    }

    public function setFilePath(?string $filePath): void {
        $this->filePath = $filePath;
    }
}
