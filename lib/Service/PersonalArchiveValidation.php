<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Validate the entire archive before files, settings or database rows are written. */
class PersonalArchiveValidation {
    public static function assertPersonal(array $payload): void {
        foreach ($payload as $key => $value) {
            if ((in_array($key, ['team_id', 'teamId'], true) && $value !== null)
                || (in_array($key, ['scope_key', 'scopeKey'], true) && is_string($value) && str_starts_with($value, 'team:'))) {
                throw new \InvalidArgumentException('Team records cannot use personal data transfer.');
            }
            if (is_array($value)) {
                self::assertPersonal($value);
            }
        }
    }
}
