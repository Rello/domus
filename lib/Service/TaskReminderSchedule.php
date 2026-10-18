<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCP\IL10N;

class TaskReminderSchedule {
    public static function calculate(string $choice, ?string $date, IL10N $l10n): int {
        $now = new \DateTimeImmutable();
        if ($choice === '5minutes') {
            $until = $now->modify('+5 minutes')->getTimestamp();
        } elseif (in_array($choice, ['1', '3', '6'], true)) {
            $target = $now->modify('first day of this month')->modify('+' . $choice . ' months');
            $until = $target->setDate((int)$target->format('Y'), (int)$target->format('m'),
                min((int)$now->format('d'), (int)$target->format('t')))->getTimestamp();
        } elseif ($choice === 'date' && $date !== null && InputValidation::date($date)) {
            $until = (new \DateTimeImmutable($date))->getTimestamp();
        } else {
            throw new \InvalidArgumentException($l10n->t('Choose a future reminder date.'));
        }
        if ($until <= $now->getTimestamp()) {
            throw new \InvalidArgumentException($l10n->t('Choose a future reminder date.'));
        }
        return $until;
    }
}
