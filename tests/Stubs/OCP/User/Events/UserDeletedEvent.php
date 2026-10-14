<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\User\Events;
use OCP\EventDispatcher\Event;
use OCP\IUser;
class UserDeletedEvent extends Event {
    public function __construct(private IUser $user) {}
    public function getUid(): string { return $this->user->getUID(); }
}
