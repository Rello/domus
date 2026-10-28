<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\Log\Audit;
use OCP\EventDispatcher\Event;
class CriticalActionPerformedEvent extends Event {
    public function __construct(private string $message, private array $parameters) {}
    public function getMessage(): string { return $this->message; }
    public function getParameters(): array { return $this->parameters; }
}
