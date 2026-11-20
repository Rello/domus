<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCP\IDBConnection;

/**
 * Team-scoped portal reads and atomic correction decisions. Every read and write names its Team,
 * so a caller cannot reach another Team's rows by omitting a filter.
 */
class RenterPortalMapper {
    private const TABLES = ['domus_action_logs', 'domus_corrections', 'domus_doclinks', 'domus_partner_rel',
        'domus_partners', 'domus_tenancies', 'domus_units'];

    public function __construct(private IDBConnection $db) {}

    private function assertTeamScoped(string $table, array $columns): void {
        if (!in_array($table, self::TABLES, true)) {
            throw new \LogicException('Table ' . $table . ' is not available to the renter portal.');
        }
        if (!is_string($columns['team_id'] ?? null) || $columns['team_id'] === '') {
            throw new \LogicException('Renter portal access to ' . $table . ' must be limited to a Team.');
        }
    }

    /** A renter document link by ID alone; its Team is taken from the link and must be authorized by the caller. */
    public function tenancyDocumentLink(int $id): ?array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from('domus_doclinks')
            ->andWhere($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter('tenancy')))
            ->andWhere($qb->expr()->isNotNull('team_id'));
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        return $rows[0] ?? null;
    }

    public function rows(string $table, array $filters): array {
        $this->assertTeamScoped($table, $filters);
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
        $this->assertTeamScoped($table, $values);
        $qb = $this->db->getQueryBuilder();
        $qb->insert($table)->values(array_map(fn ($value) => $qb->createNamedParameter($value), $values));
        $qb->executeStatement();
        return (int)$qb->getLastInsertId();
    }

    public function update(string $table, array $filters, array $values): int {
        $this->assertTeamScoped($table, $filters);
        if (array_key_exists('team_id', $values) && $values['team_id'] !== $filters['team_id']) {
            throw new \LogicException('Renter portal updates cannot move rows to another Team.');
        }
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
                $this->update('domus_corrections', ['id' => (int)$request['id'], 'team_id' => $request['team_id']], ['state' => $state]);
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
