<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Exception\ConflictException;
use OCP\IDBConnection;
use OCP\IL10N;

/** Internal graph operations. The service supplies authorized parent/child IDs, never client table names. */
class FinancialHistoryMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ManagementAccessContext $access, private IL10N $l10n) {
        parent::__construct($db, 'domus_units', Unit::class, $access);
    }

    public function rows(string $table, array $where, string $userId, bool $owned = true): array {
        // Keep large cleanups below database parameter limits, including SQLite.
        foreach ($where as $key => $value) {
            if (!is_array($value) || count($value) <= 500) continue;
            $rows = [];
            foreach (array_chunk(array_values(array_unique($value)), 500) as $chunk) {
                foreach ($this->rows($table, array_replace($where, [$key => $chunk]), $userId, $owned) as $row) $rows[(int)$row['id']] = $row;
            }
            ksort($rows, SORT_NUMERIC);
            return array_values($rows);
        }
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($table);
        foreach ($where as $key => $value) {
            if (is_array($value)) {
                if ($value === []) return [];
                $qb->andWhere($qb->expr()->in($key, $qb->createNamedParameter(array_map('intval', $value), $qb::PARAM_INT_ARRAY)));
            } else {
                $qb->andWhere($value === null ? $qb->expr()->isNull($key)
                    : $qb->expr()->eq($key, $qb->createNamedParameter($value)));
            }
        }
        if ($owned) $qb->andWhere($this->ownerExpression($qb, $userId));
        else $this->applyScope($qb);
        $rows = $qb->executeQuery()->fetchAll();
        usort($rows, static fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        return $rows;
    }

    public function change(string $table, array $row, array $values, string $userId, bool $owned = true): void {
        $qb = $this->db->getQueryBuilder();
        if ($values === []) $qb->delete($table);
        else {
            $qb->update($table);
            foreach ($values as $key => $value) $qb->set($key, $qb->createNamedParameter($value));
        }
        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter((int)$row['id'], $qb::PARAM_INT)));
        // Do not overwrite or delete a record changed since the reviewed snapshot.
        foreach ($row as $key => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($key)
                : $qb->expr()->eq($key, $qb->createNamedParameter($value)));
        }
        if ($owned) $qb->andWhere($this->ownerExpression($qb, $userId));
        else $this->applyScope($qb);
        if ($qb->executeStatement() !== 1) {
            throw new ConflictException($this->l10n->t('Financial history changed. Create a new preview before removing it.'));
        }
    }

    /** Global rule-context IDs are reached only through an authorized tenancy. */
    public function removeRuleContext(int $tenancyId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete('domus_rule_context')
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter('rentReview.tenancy')))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($tenancyId, $qb::PARAM_INT)))
            ->executeStatement();
    }

    public function transaction(callable $operation): mixed {
        $this->db->beginTransaction();
        try {
            $result = $operation();
            $this->db->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function lockScope(string $table, int $id, string $userId, bool $owned = true): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($table)->set('id', $qb->createNamedParameter($id, $qb::PARAM_INT))
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)));
        if ($owned) $qb->andWhere($this->ownerExpression($qb, $userId));
        else $this->applyScope($qb);
        $qb->executeStatement();
    }
}
