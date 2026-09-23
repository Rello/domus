<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP\Files;

class Folder {
    public function getById(int $id): array { return []; }
    public function newFolder(string $path): Folder { return new Folder(); }
    public function newFile(string $path, $content = null): File { return new File(); }
    public function delete(): void {}
}
