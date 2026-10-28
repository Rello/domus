<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\RenterAccessMapper;
use OCP\IDBConnection;
use OCP\TaskProcessing\{IManager, Task};

/** Removes Personal ownership, never shared business history or physical files. */
class UserCleanupService {
    public function __construct(private IDBConnection $db, private RenterAccessMapper $renters, private UnitMoveGuard $guard, private IManager $tasks, private ?AuditService $audit = null) {}

    public function cleanup(string $uid): void {
        $this->guard->acquire($uid, true);
        try {
            $this->db->beginTransaction();
            try {
                $entities = [];
                foreach (['property' => 'domus_properties', 'unit' => 'domus_units', 'tenancy' => 'domus_tenancies', 'booking' => 'domus_bookings', 'partner' => 'domus_partners'] as $type => $table) {
                    $entities[$type] = $this->ids($table, ['user_id' => $uid, 'team_id' => null]);
                }
                foreach ($entities as $type => $ids) {
                    foreach (['domus_task_steps', 'domus_tasks', 'domus_workflow_runs'] as $table) {
                        $this->deleteIds($table, 'entity_id', $ids, ['entity_type' => $type, 'team_id' => null]);
                    }
                }
                $this->deleteIds('domus_booking_years', 'property_id', $entities['property'], ['team_id' => null]);
                $this->deleteIds('domus_booking_years', 'unit_id', $entities['unit'], ['team_id' => null]);
                $this->deleteIds('domus_rule_context', 'entity_id', $entities['tenancy'], ['entity_type' => 'rentReview.tenancy']);
                $rules = $this->ids('domus_rule_sets', ['user_id' => $uid, 'team_id' => null]);
                $this->deleteIds('domus_rule_tasks', 'ruleset_id', $rules);
                $templates = $this->ids('domus_task_templates', ['scope_key' => 'user:' . $uid, 'team_id' => null]);
                $this->deleteIds('domus_task_tpl_steps', 'template_id', $templates, ['team_id' => null]);
                foreach (['domus_task_templates', 'domus_accounts'] as $table) {
                    $this->delete($table, ['scope_key' => 'user:' . $uid, 'team_id' => null]);
                }
                foreach (['domus_docLinks', 'domus_action_logs', 'domus_partner_rel', 'domus_dist_key_units', 'domus_bookings', 'domus_tenancies', 'domus_dist_keys', 'domus_units', 'domus_properties', 'domus_partners', 'domus_rule_sets'] as $table) {
                    $this->delete($table, ['user_id' => $uid, 'team_id' => null]);
                }
                // Journals belong to the initiating account, including completed moves.
                // Destination copies and the transferred Team records remain intact.
                $this->delete('domus_unit_moves', ['user_id' => $uid]);
                $unlinked = $this->renters->unlinkDeletedUser($uid, false);
                $this->db->commit();
            } catch (\Throwable $e) {
                $this->db->rollBack();
                throw $e;
            }
            foreach ($unlinked as $partner) {
                $this->audit?->account((int)$partner['id'], $partner['user_id'], $partner['team_id'] ?? null, $uid, null);
            }
            foreach (['property', 'unit', 'tenancy', 'partner'] as $type) {
                foreach ($entities[$type] as $id) $this->audit?->record($type . '.deleted', (int)$id, $uid, null);
            }
            // Use the public task API only for Domus-owned previews. Files and generic
            // metadata jobs remain Nextcloud's responsibility.
            foreach ($this->tasks->getUserTasksByApp($uid, 'domus') as $task) {
                if ($task->getUserId() !== $uid || $task->getAppId() !== 'domus') continue;
                if (in_array($task->getStatus(), [Task::STATUS_SCHEDULED, Task::STATUS_RUNNING], true)) {
                    $this->tasks->cancelTask($task->getId());
                }
                $this->tasks->deleteTask($task);
            }
        } finally {
            $this->guard->release($uid, true);
        }
    }

    private function constrain($qb, array $where): void {
        foreach ($where as $column => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($column) : $qb->expr()->eq($column, $qb->createNamedParameter($value)));
        }
    }

    private function ids(string $table, array $where): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')->from($table);
        $this->constrain($qb, $where);
        $result = $qb->executeQuery();
        try {
            return array_map('intval', array_column($result->fetchAll(), 'id'));
        } finally {
            $result->closeCursor();
        }
    }

    private function delete(string $table, array $where): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($table);
        $this->constrain($qb, $where);
        $qb->executeStatement();
    }

    private function deleteIds(string $table, string $column, array $ids, array $where = []): void {
        foreach (array_chunk($ids, 500) as $chunk) {
            $qb = $this->db->getQueryBuilder();
            $qb->delete($table)->where($qb->expr()->in($column, $qb->createNamedParameter($chunk, $qb::PARAM_INT_ARRAY)));
            $this->constrain($qb, $where);
            $qb->executeStatement();
        }
    }
}
