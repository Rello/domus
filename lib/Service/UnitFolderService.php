<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\Unit;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\Files\{Folder, IRootFolder};
use OCP\IL10N;

/** Resolve migrated folders in the current actor's mount namespace, never the creator's. */
class UnitFolderService {
    public function __construct(private IRootFolder $root, private IL10N $l10n) {}

    public function byId(string $userId, int $id): Folder {
        foreach ($this->root->getUserFolder($userId)->getById($id) as $node) {
            if ($node instanceof Folder && $node->isReadable()) return $node;
        }
        throw new ResourceNotFoundException($this->l10n->t('The unit folder is not accessible.'));
    }

    public function path(string $userId, Folder $folder): string {
        $path = $this->root->getUserFolder($userId)->getRelativePath($folder->getPath());
        if ($path === null || $path === '') {
            throw new \InvalidArgumentException($this->l10n->t('Select a dedicated unit folder.'));
        }
        return $path;
    }

    public function refreshPath(Unit $unit, string $userId): void {
        if ($unit->getDocumentFolderId()) {
            $unit->setDocumentPath($this->path($userId, $this->byId($userId, (int)$unit->getDocumentFolderId())));
        }
    }

    public function selectedFolderId(string $userId, string $path): int {
        $folder = $this->root->getUserFolder($userId)->get(trim($path, '/'));
        if (!$folder instanceof Folder || !$folder->isCreatable()) {
            throw new \InvalidArgumentException($this->l10n->t('The unit folder is not writable.'));
        }
        $this->path($userId, $folder);
        return (int)$folder->getId();
    }
}
