<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP;

interface IURLGenerator {
    public function getAbsoluteURL(string $url): string;

    public function imagePath(string $appName, string $file): string;
}
