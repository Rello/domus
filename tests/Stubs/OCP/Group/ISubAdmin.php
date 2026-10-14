<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCP\Group;

use OCP\IUser;

interface ISubAdmin {
    public function isSubAdmin(IUser $user): bool;
}
