<?php

namespace OCA\Domus\Service;

use InvalidArgumentException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IL10N;

class FileService {
    public function __construct(private IRootFolder $rootFolder, private IL10N $l10n) {
    }

    public function createFile(string $relativePath, string $content, string $userId): void {
        $this->assertRelativePath($relativePath);
        $userFolder = $this->rootFolder->getUserFolder($userId);
        $this->ensureParentFolders($userFolder, $relativePath);

        if ($userFolder->nodeExists($relativePath)) {
            $node = $userFolder->get($relativePath);
            if (!$node instanceof File) {
                throw new InvalidArgumentException($this->l10n->t('The path %s is not a file.', [$relativePath]));
            }
            $node->putContent($content);
            return;
        }

        $file = $userFolder->newFile($relativePath);
        $file->putContent($content);
    }

    public function assertPathReadable(string $relativePath, string $userId): void {
        $this->assertRelativePath($relativePath);
        $userFolder = $this->rootFolder->getUserFolder($userId);
        if (!$userFolder->nodeExists($relativePath)) {
            throw new InvalidArgumentException($this->l10n->t('File %s was not found.', [$relativePath]));
        }
        $node = $userFolder->get($relativePath);
        if (!$node instanceof File) {
            throw new InvalidArgumentException($this->l10n->t('The path %s is not a file.', [$relativePath]));
        }
    }

    private function assertRelativePath(string $path): void {
        if ($path === '' || str_contains($path, '..') || str_starts_with($path, '/')) {
            throw new InvalidArgumentException($this->l10n->t('Invalid document path.'));
        }
    }

    private function ensureParentFolders(Folder $userFolder, string $relativePath): void {
        $directory = dirname($relativePath);
        if ($directory === '.' || $directory === '') {
            return;
        }
        $segments = array_filter(explode('/', $directory));
        $current = $userFolder;
        foreach ($segments as $segment) {
            $nextPath = $current->getPath() . '/' . $segment;
            if ($current->nodeExists($segment)) {
                $next = $current->get($segment);
                if (!$next instanceof Folder) {
                    throw new InvalidArgumentException($this->l10n->t('The path %s is not a folder.', [$nextPath]));
                }
                $current = $next;
                continue;
            }
            $current = $current->newFolder($segment);
        }
    }
}
