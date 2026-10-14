<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCP\IDBConnection;

/** Explicitly scoped portal reads and atomic correction decisions. */
class RenterPortalMapper {
    public function __construct(private IDBConnection $db) {}

    public function rows(string $table, array $filters): array {
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

    public function insert(string $table, array $values): int {
        $qb = $this->db->getQueryBuilder();
        $qb->insert($table)->values(array_map(fn ($value) => $qb->createNamedParameter($value), $values));
        $qb->executeStatement();
        return (int)$qb->getLastInsertId();
    }

    public function update(string $table, array $filters, array $values): int {
        $qb = $this->db->getQueryBuilder();
        $qb->update($table);
        foreach ($values as $key => $value) $qb->set($key, $qb->createNamedParameter($value));
        foreach ($filters as $key => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($key) : $qb->expr()->eq($key, $qb->createNamedParameter($value)));
        }
        return $qb->executeStatement();
    }

    /** A pending request and all original fields must still match at application time. */
    public function decide(array $request, array $original, array $proposed, string $actor, bool $approve, callable $recordDecision): string {
        $this->db->beginTransaction();
        try {
            $filters = ['id' => (int)$request['id'], 'team_id' => $request['team_id'], 'state' => 'pending'];
            $state = $approve ? 'approved' : 'rejected';
            if ($this->update('domus_corrections', $filters, ['state' => $state, 'decided_by' => $actor, 'decided_at' => time()]) !== 1) {
                throw new \DomainException('This request has already been reviewed.');
            }
            if ($approve && $this->update('domus_partners', ['id' => (int)$request['partner_id'], 'team_id' => $request['team_id'], 'nc_user_id' => $request['requested_by']] + $original,
                $proposed + ['updated_at' => time()]) !== 1) {
                $state = 'conflict';
                $this->update('domus_corrections', ['id' => (int)$request['id']], ['state' => $state]);
            }
            $recordDecision($state);
            $this->db->commit();
            return $state;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}
