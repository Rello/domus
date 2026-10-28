<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Exception\ConflictException;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\Lock\ILockingProvider;

/** The move and normal writes share an actor lock, including background rule evaluation. */
class UnitMoveGuard {
    public function __construct(private ILockingProvider $locks, private IDBConnection $db, private IL10N $l10n) {}

    public function acquire(string $userId, bool $exclusive = false): void {
        try {
            $this->locks->acquireLock('domus-unit-move/' . hash('sha256', $userId), $exclusive ? ILockingProvider::LOCK_EXCLUSIVE : ILockingProvider::LOCK_SHARED);
        } catch (\OCP\Lock\LockedException $e) {
            throw new ConflictException($this->l10n->t('Another change is in progress. Try again.'));
        }
    }

    public function release(string $userId, bool $exclusive = false): void {
        $this->locks->releaseLock('domus-unit-move/' . hash('sha256', $userId), $exclusive ? ILockingProvider::LOCK_EXCLUSIVE : ILockingProvider::LOCK_SHARED);
    }

    public function assertWritable(string $userId): void {
        $qb = $this->db->getQueryBuilder();
        $active = $qb->select('id')->from('domus_unit_moves')
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('copying')))
            ->setMaxResults(1)->executeQuery()->fetchOne();
        if ($active !== false) {
            throw new ConflictException($this->l10n->t('Your changes are paused during a unit move. Resume or cancel the move from the unit menu.'));
        }
    }
}
