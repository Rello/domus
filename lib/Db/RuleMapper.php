<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\IDBConnection;
use OCP\IL10N;

/** Task links inherit ownership from their ruleset; every entry point checks that parent. */
class RuleMapper {
    public function __construct(private IDBConnection $db, private ManagementAccessContext $access, private IL10N $l10n) {
    }

    private function scope($qb): void {
        $userId = $this->access->managementUserId();
        $teamId = $this->access->activeTeamId();
        $qb->andWhere($teamId !== null
            ? $qb->expr()->eq('team_id', $qb->createNamedParameter($teamId))
            : $qb->expr()->andX($qb->expr()->isNull('team_id'), $qb->expr()->eq('user_id', $qb->createNamedParameter($userId))));
    }

    public function listRules(): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from('domus_rule_sets')->orderBy('id', 'ASC');
        $this->scope($qb);
        return array_map(fn($row) => $this->decodeRule($row), $qb->executeQuery()->fetchAll());
    }

    public function findRule(int $id): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from('domus_rule_sets')->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
        $this->scope($qb);
        $row = $qb->executeQuery()->fetch();
        if (!$row) throw new ResourceNotFoundException($this->l10n->t('Ruleset not found.'));
        return $this->decodeRule($row);
    }

    private function decodeRule(array $row): array {
        return ['id' => (int)$row['id']] + json_decode($row['definition'], true, 512, JSON_THROW_ON_ERROR);
    }

    public function saveRule(?int $id, array $definition): array {
        $qb = $this->db->getQueryBuilder();
        $json = json_encode($definition, JSON_THROW_ON_ERROR);
        if ($id === null) {
            $qb->insert('domus_rule_sets')->values([
                'user_id' => $qb->createNamedParameter($this->access->managementUserId()),
                'team_id' => $qb->createNamedParameter($this->access->activeTeamId()),
                'definition' => $qb->createNamedParameter($json),
            ])->executeStatement();
            $id = (int)$qb->getLastInsertId();
        } else {
            $this->findRule($id);
            $qb->update('domus_rule_sets')->set('definition', $qb->createNamedParameter($json))
                ->set('user_id', $qb->createNamedParameter($this->access->managementUserId()))
                ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
            $this->scope($qb);
            $qb->executeStatement();
        }
        return ['id' => $id] + $definition;
    }

    /** Serialize evaluation, snoozing and task creation on the parent row, across workers. */
    public function locked(int $id, callable $action): mixed {
        $this->db->beginTransaction();
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->update('domus_rule_sets')->set('id', $qb->createNamedParameter($id))
                ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
            $this->scope($qb);
            $qb->executeStatement();
            $result = $action($this->findRule($id));
            $this->db->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function deleteRule(int $id): void {
        $this->locked($id, function () use ($id) {
            $qb = $this->db->getQueryBuilder();
            $qb->delete('domus_rule_tasks')->where($qb->expr()->eq('ruleset_id', $qb->createNamedParameter($id)))->executeStatement();
            $qb = $this->db->getQueryBuilder();
            $qb->delete('domus_rule_sets')->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
            $this->scope($qb);
            $qb->executeStatement();
        });
    }

    public function taskLinks(int $ruleId): array {
        $this->findRule($ruleId);
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from('domus_rule_tasks')->where($qb->expr()->eq('ruleset_id', $qb->createNamedParameter($ruleId)));
        $result = [];
        foreach ($qb->executeQuery()->fetchAll() as $row) {
            $result[$row['occurrence_key']] = ['id' => (int)$row['id'], 'taskId' => (int)$row['task_id']];
        }
        return $result;
    }

    /** Caller holds the ruleset lock. Retain links even after task completion or deletion. */
    public function linkTask(int $ruleId, string $occurrence, int $taskId): array {
        $this->findRule($ruleId);
        $qb = $this->db->getQueryBuilder();
        $qb->insert('domus_rule_tasks')->values([
            'ruleset_id' => $qb->createNamedParameter($ruleId),
            'occurrence_key' => $qb->createNamedParameter($occurrence),
            'task_id' => $qb->createNamedParameter($taskId),
        ])->executeStatement();
        return ['id' => (int)$qb->getLastInsertId(), 'taskId' => $taskId];
    }

    /** Caller supplies only tenancy IDs already authorized through TenancyMapper. */
    public function references(array $tenancyIds): array {
        if (!$tenancyIds) return [];
        $qb = $this->db->getQueryBuilder();
        $rows = $qb->select('entity_id', 'data')->from('domus_rule_context')
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter('rentReview.tenancy')))
            ->andWhere($qb->expr()->in('entity_id', $qb->createNamedParameter($tenancyIds, $qb::PARAM_INT_ARRAY)))
            ->executeQuery()->fetchAll();
        $references = [];
        foreach ($rows as $row) {
            $data = json_decode($row['data'], true, 512, JSON_THROW_ON_ERROR);
            if (array_key_exists('referenceDate', $data)) $references[(int)$row['entity_id']] = $data['referenceDate'];
        }
        return $references;
    }

    /** Authorization is checked against the source entity before this method is called. */
    public function saveReference(int $tenancyId, string $date): void {
        $values = ['entity_type' => 'rentReview.tenancy', 'entity_id' => $tenancyId,
            'data' => json_encode(['referenceDate' => $date], JSON_THROW_ON_ERROR)];
        $insert = $this->db->getQueryBuilder();
        try {
            $insert->insert('domus_rule_context')->values([
                'entity_type' => $insert->createNamedParameter($values['entity_type']),
                'entity_id' => $insert->createNamedParameter($tenancyId, $insert::PARAM_INT),
                'data' => $insert->createNamedParameter($values['data']),
            ])->executeStatement();
        } catch (\OCP\DB\Exception $e) {
            if ($e->getReason() !== \OCP\DB\Exception::REASON_CONSTRAINT_VIOLATION) throw $e;
        }
        $qb = $this->db->getQueryBuilder();
        $qb->update('domus_rule_context')->set('data', $qb->createNamedParameter($values['data']))
            ->where($qb->expr()->eq('entity_type', $qb->createNamedParameter($values['entity_type'])))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($tenancyId, $qb::PARAM_INT)))
            ->executeStatement();
    }

    /** Only the scheduled job uses this inventory; it revalidates each owner's access. */
    public function backgroundOwners(): array {
        $qb = $this->db->getQueryBuilder();
        return $qb->selectDistinct(['user_id', 'team_id'])->from('domus_rule_sets')->executeQuery()->fetchAll();
    }
}
