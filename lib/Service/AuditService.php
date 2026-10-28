<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\EventDispatcher\IEventDispatcher;
use OCP\IUserSession;
use OCP\Log\Audit\CriticalActionPerformedEvent;
use Psr\Log\LoggerInterface;

/** Security-relevant events only; ordinary business changes belong in Activities. */
class AuditService {
    private const EVENTS = [
        'unit_move.started', 'unit_move.completed', 'unit_move.failed', 'unit_move.cancelled',
        'account.linked', 'account.unlinked', 'account.replaced', 'tenancy.relationships_changed',
        'unit.exported', 'unit.imported', 'property.deleted', 'unit.deleted', 'tenancy.deleted', 'partner.deleted',
    ];

    public function __construct(
        private IEventDispatcher $dispatcher,
        private IUserSession $session,
        private LoggerInterface $logger,
    ) {}

    /** Call after the write/transaction succeeds. Values are identifiers and counts, never record contents. */
    public function record(string $event, int $entityId, string $owner, ?string $teamId, array $details = []): void {
        if (!in_array($event, self::EVENTS, true)) {
            throw new \InvalidArgumentException('Unsupported Domus audit event');
        }
        $parameters = ['event' => 'domus.' . $event, 'actor' => $this->session->getUser()?->getUID() ?? 'system',
            'entityId' => $entityId, 'owner' => $owner, 'scope' => $teamId ?: 'Personal'];
        $message = 'Domus action "%s" performed by "%s" for entity "%s", owner "%s", scope "%s".';
        foreach ($details as $key => $value) {
            if (!preg_match('/^[a-zA-Z][a-zA-Z0-9]*$/D', $key) || array_key_exists($key, $parameters)
                || (!is_scalar($value) && $value !== null)) {
                throw new \InvalidArgumentException('Invalid Domus audit parameter');
            }
            $parameters[$key] = $value;
            $message .= ' ' . $key . ': "%s".';
        }
        try {
            // Keep the two-argument API used by Analytics for supported Nextcloud versions.
            $this->dispatcher->dispatchTyped(new CriticalActionPerformedEvent($message, $parameters));
        } catch (\Throwable $e) {
            // A logging failure must not turn an already committed action into a retryable API error.
            $this->logger->error('Domus audit event delivery failed', ['app' => 'domus', 'event' => $event, 'exception' => $e]);
        }
    }

    public function account(int $partnerId, string $owner, ?string $teamId, ?string $oldUid, ?string $newUid): void {
        $oldUid = $oldUid ?: null;
        $newUid = $newUid ?: null;
        if ($oldUid === $newUid) return;
        $action = $oldUid === null ? 'linked' : ($newUid === null ? 'unlinked' : 'replaced');
        $this->record('account.' . $action, $partnerId, $owner, $teamId, ['oldUser' => $oldUid, 'newUser' => $newUid]);
    }

    public function relationships(int $tenancyId, string $owner, ?string $teamId, ?int $oldUnit, int $newUnit, array $oldPartners, array $newPartners): void {
        $oldPartners = array_values(array_unique(array_map('intval', $oldPartners)));
        $newPartners = array_values(array_unique(array_map('intval', $newPartners)));
        sort($oldPartners);
        sort($newPartners);
        if ($oldUnit === $newUnit && $oldPartners === $newPartners) return;
        $this->record('tenancy.relationships_changed', $tenancyId, $owner, $teamId,
            ['oldUnit' => $oldUnit, 'newUnit' => $newUnit,
                'oldPartners' => implode(',', $oldPartners), 'newPartners' => implode(',', $newPartners)]);
    }
}
