<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP\Teams;

class Team {
    public function __construct(private string $id, private string $displayName, private ?string $link) {}
    public function getId(): string { return $this->id; }
    public function getDisplayName(): string { return $this->displayName; }
}
