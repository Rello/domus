<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\EventDispatcher;
interface IEventListener {
    public function handle(Event $event): void;
}
