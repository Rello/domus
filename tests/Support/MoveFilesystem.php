<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Support;

use OCP\Files\{File, Folder};

class MoveFilesystem {
    public array $nodes = [];
    public int $nextId = 1;
    public ?string $failFile = null;
    public function folder(string $path, ?int $id = null): MoveFolder {
        return $this->nodes[$path] = new MoveFolder($this, $path, $id ?? $this->nextId++);
    }
    public function file(string $path, string $content): MoveFile {
        return $this->nodes[$path] = new MoveFile($this->nextId++, $path, $content);
    }
}
class MoveFolder extends Folder {
    public bool $writable = true;
    public function __construct(private MoveFilesystem $fs, private string $path, private int $id) {}
    public function getId(): int { return $this->id; }
    public function getPath(): string { return $this->path; }
    public function getName(): string { return basename($this->path); }
    public function isReadable(): bool { return true; }
    public function isCreatable(): bool { return $this->writable; }
    public function getFreeSpace(): int { return 10000000; }
    public function getRelativePath(string $path): ?string { return str_starts_with($path, $this->path . '/') ? substr($path, strlen($this->path) + 1) : null; }
    public function nodeExists(string $path): bool { return isset($this->fs->nodes[$this->path . '/' . $path]); }
    public function get(string $path): File|Folder {
        return $this->fs->nodes[$this->path . '/' . $path] ?? throw new \RuntimeException('Missing: ' . $path);
    }
    public function getById(int $id): array {
        return array_values(array_filter($this->fs->nodes, fn($node) => $node->getId() === $id && str_starts_with($node->getPath(), $this->path . '/')));
    }
    public function getDirectoryListing(): array {
        return array_values(array_filter($this->fs->nodes, fn($node) => dirname($node->getPath()) === $this->path));
    }
    public function newFolder(string $path): Folder { return $this->fs->folder($this->path . '/' . $path); }
    public function newFile(string $path, $content = null): File {
        if ($path === $this->fs->failFile) throw new \RuntimeException('Storage unavailable');
        $bytes = is_resource($content) ? stream_get_contents($content) : (string)$content;
        if (is_resource($content)) fclose($content);
        return $this->fs->file($this->path . '/' . $path, $bytes);
    }
}
class MoveFile extends File {
    public function __construct(int $id, private string $path, public string $content) { parent::__construct($id, basename($path)); }
    public function getPath(): string { return $this->path; }
    public function getEtag(): string { return hash('sha256', $this->content); }
    public function getSize(): int|float { return strlen($this->content); }
    public function fopen(string $mode) { $stream = fopen('php://temp', 'w+b'); fwrite($stream, $this->content); rewind($stream); return $stream; }
}
