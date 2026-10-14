<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Listener;

use OCA\Domus\Db\RenterAccessMapper;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\User\Events\UserDeletedEvent;

/** @implements IEventListener<UserDeletedEvent> */
class UserDeletedListener implements IEventListener {
    public function __construct(private RenterAccessMapper $mapper) {
    }

    public function handle(Event $event): void {
        if ($event instanceof UserDeletedEvent) {
            // Preserve business history and actor IDs; remove only the reusable login identity.
            $this->mapper->unlinkDeletedUser($event->getUid());
        }
    }
}
