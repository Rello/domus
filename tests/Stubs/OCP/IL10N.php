<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP;

interface IL10N {
    public function t(string $text, array $parameters = [], ?int $count = null): string;
}
