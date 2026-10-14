<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP;

interface IGroupManager {
    public function isInGroup($userId, $group);
    public function isAdmin($userId);
    public function getUserGroupIds(IUser $user): array;
}
