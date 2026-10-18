<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCP\IDBConnection;
use OCP\IL10N;

/** Read renter records through the existing partner and tenancy relationships. */
class RenterAccessMapper {
    public function __construct(private IDBConnection $db, private IL10N $l10n) {
    }

    private function select(string $table, array $filters): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($table);
        foreach ($filters as $key => $value) {
            $qb->andWhere($qb->expr()->eq($key, $qb->createNamedParameter($value)));
        }
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        return $rows;
    }

    public function partnersForUser(string $uid): array {
        return array_values(array_filter($this->select('domus_partners', ['nc_user_id' => $uid, 'partner_type' => 'tenant']),
            static fn (array $partner): bool => !empty($partner['team_id'])));
    }

    public function partner(string $teamId, int $id): ?array {
        return $this->select('domus_partners', ['team_id' => $teamId, 'id' => $id, 'partner_type' => 'tenant'])[0] ?? null;
    }

    public function linkedTenancies(string $teamId, int $partnerId): array {
        $rows = [];
        foreach ($this->select('domus_partner_rel', ['team_id' => $teamId, 'partner_id' => $partnerId, 'type' => 'tenancy']) as $rel) {
            $tenancy = $this->select('domus_tenancies', ['team_id' => $teamId, 'id' => (int)$rel['relation_id']])[0] ?? null;
            if ($tenancy === null) {
                continue;
            }
            $unit = $this->select('domus_units', ['team_id' => $teamId, 'id' => (int)$tenancy['unit_id']])[0] ?? null;
            if ($unit !== null) {
                $rows[] = ['id' => (int)$tenancy['id'], 'unitLabel' => $unit['label'],
                    'startDate' => $tenancy['start_date'], 'endDate' => $tenancy['end_date'],
                    'baseRent' => $tenancy['base_rent'] ?? null];
            }
        }
        return $rows;
    }

    /** Account deletion must not leave grants for a subsequently reused UID. */
    public function unlinkDeletedUser(string $uid): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update('domus_partners')->set('nc_user_id', $qb->createNamedParameter(null))
            ->set('updated_at', $qb->createNamedParameter(time()))
            ->where($qb->expr()->eq('nc_user_id', $qb->createNamedParameter($uid)));
        $qb->executeStatement();
    }

    public function linkUser(string $teamId, int $partnerId, string $uid): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update('domus_partners')->set('nc_user_id', $qb->createNamedParameter($uid))
            ->set('updated_at', $qb->createNamedParameter(time()))
            ->where($qb->expr()->eq('team_id', $qb->createNamedParameter($teamId)))
            ->andWhere($qb->expr()->eq('id', $qb->createNamedParameter($partnerId)))
            ->andWhere($qb->expr()->orX($qb->expr()->isNull('nc_user_id'), $qb->expr()->eq('nc_user_id', $qb->createNamedParameter(''))));
        if ($qb->executeStatement() !== 1) {
            throw new \DomainException($this->l10n->t('The contact changed. Reload and try again.'));
        }
    }
}
