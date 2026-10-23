<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCP\IConfig;
use OCP\IDBConnection;

class PortfolioSettingsService {
    /** Cache stored values (including absence), not the caller's default. */
    private array $teamValues = [];

    public function __construct(
        private ManagementAccessContext $access,
        private IConfig $config,
        private IDBConnection $db,
    ) {
    }

    public function getValue(string $userId, string $key, string $default): string {
        $teamId = in_array($key, ['taxRate', 'utilityReportTemplate', AiDocumentValidationService::SETTING], true) ? $this->access->activeTeamId() : null;
        if ($teamId === null) {
            return $this->config->getUserValue($userId, 'domus', $key, $default);
        }
        $value = $this->getTeamValue($teamId, $key);
        return $value === false ? $default : (string)$value;
    }

    private function getTeamValue(string $teamId, string $key): string|false {
        if (array_key_exists($key, $this->teamValues[$teamId] ?? [])) {
            return $this->teamValues[$teamId][$key];
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('setting_value')->from('domus_team_settings')
            ->where($qb->expr()->eq('team_id', $qb->createNamedParameter($teamId)))
            ->andWhere($qb->expr()->eq('setting_key', $qb->createNamedParameter($key)));
        $value = $qb->executeQuery()->fetchOne();
        return $this->teamValues[$teamId][$key] = $value === false ? false : (string)$value;
    }

    public function setValue(string $userId, string $key, string $value): void {
        $teamId = in_array($key, ['taxRate', 'utilityReportTemplate', AiDocumentValidationService::SETTING], true) ? $this->access->activeTeamId() : null;
        if ($teamId === null) {
            $this->config->setUserValue($userId, 'domus', $key, $value);
            return;
        }
        $existing = $this->getTeamValue($teamId, $key);
        if ($existing === $value) {
            return;
        }
        if ($existing === false) {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('domus_team_settings')->values([
                'team_id' => $qb->createNamedParameter($teamId),
                'setting_key' => $qb->createNamedParameter($key),
                'setting_value' => $qb->createNamedParameter($value),
            ])->executeStatement();
            $this->teamValues[$teamId][$key] = $value;
            return;
        }
        $qb = $this->db->getQueryBuilder();
        $qb->update('domus_team_settings')
            ->set('setting_value', $qb->createNamedParameter($value))
            ->where($qb->expr()->eq('team_id', $qb->createNamedParameter($teamId)))
            ->andWhere($qb->expr()->eq('setting_key', $qb->createNamedParameter($key)));
        $qb->executeStatement();
        $this->teamValues[$teamId][$key] = $value;
    }
}
