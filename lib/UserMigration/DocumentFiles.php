<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\UserMigration;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\UserMigration\IExportDestination;
use OCP\UserMigration\IImportSource;
use OCP\UserMigration\UserMigrationException;

class DocumentFiles {
    public function __construct(private IRootFolder $rootFolder) {
    }

    public function estimateSize(string $uid, array $links): int|float {
        $size = 0;
        $ids = array_unique(array_column($links, 'file_id'));
        if ($ids === []) {
            return 0;
        }
        $folder = $this->rootFolder->getUserFolder($uid);
        foreach ($ids as $id) {
            $file = $folder->getById((int)$id)[0] ?? null;
            if ($file instanceof File) {
                $size += max(0, $file->getSize());
            }
        }
        return ceil($size / 1024);
    }

    /** Export each linked file once, through the exporting user's filesystem. */
    public function export(string $uid, array $links, IExportDestination $destination): array {
        $files = [];
        $folder = $this->rootFolder->getUserFolder($uid);
        foreach ($links as $link) {
            $id = (int)($link['file_id'] ?? 0);
            if (isset($files[$id])) {
                continue;
            }
            $file = $folder->getById($id)[0] ?? null;
            if (!$file instanceof File || $id <= 0) {
                throw new UserMigrationException('A linked Domus document is missing or inaccessible: ' . $id);
            }
            $stream = $file->fopen('rb');
            if (!is_resource($stream)) {
                throw new UserMigrationException('Unable to read Domus document: ' . $id);
            }
            try {
                $destination->addFileAsStream('domus/documents/' . $id, $stream);
            } finally {
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }
            $files[$id] = $file->getName();
        }
        return $files;
    }

    /** @return array{files: array<int,int>, folder: ?Folder} */
    public function import(string $uid, array $files, IImportSource $source): array {
        if ($files === []) {
            return ['files' => [], 'folder' => null];
        }
        // A separate destination avoids overwriting existing files or depending on Files migrator order.
        $folder = $this->rootFolder->getUserFolder($uid)->newFolder('Domus import ' . bin2hex(random_bytes(8)));
        $ids = [];
        try {
            foreach ($files as $id => $name) {
                if (!ctype_digit((string)$id) || (int)$id <= 0 || !is_string($name) || $name === '' || strpbrk($name, "/\\\0") !== false || in_array($name, ['.', '..'], true)) {
                    throw new UserMigrationException('Invalid Domus document manifest');
                }
                $stream = $source->getFileAsStream('domus/documents/' . $id);
                if (!is_resource($stream)) {
                    throw new UserMigrationException('Unable to read archived Domus document: ' . $id);
                }
                try {
                    $file = $folder->newFolder((string)$id)->newFile($name, $stream);
                } finally {
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                }
                $newId = $file->getId();
                if ($newId === null || $newId <= 0) {
                    throw new UserMigrationException('Unable to resolve imported Domus document');
                }
                $ids[(int)$id] = $newId;
            }
        } catch (\Throwable $e) {
            $folder->delete();
            throw $e;
        }
        return ['files' => $ids, 'folder' => $folder];
    }
}
