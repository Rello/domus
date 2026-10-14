<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\AppFramework\Http;

use OCP\Files\File;

class FileDisplayResponse {
    private array $headers;

    public function __construct(File $file, private int $statusCode = 200, array $headers = []) {
        // Like Nextcloud, this response does not infer Content-Type.
        $this->headers = $headers + ['Content-Disposition' => 'inline; filename="' . $file->getName() . '"'];
    }

    public function addHeader(string $name, string $value): void { $this->headers[$name] = $value; }
    public function getHeaders(): array { return $this->headers; }
    public function getStatus(): int { return $this->statusCode; }
}
