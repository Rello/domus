<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Exception\{ConflictException, ResourceNotFoundException};
use OCP\{IDBConnection, IL10N};

/** Explicit source predicates are intentional: ordinary mappers cannot cross ownership scopes. */
class UnitMoveDataService {
    public function __construct(private IDBConnection $db, private IL10N $l10n) {}

    public function rows(string $table, array $where): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($table);
        foreach ($where as $column => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($column) : $qb->expr()->eq($column, $qb->createNamedParameter($value)));
        }
        $rows = $qb->executeQuery()->fetchAll();
        usort($rows, fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        return $rows;
    }

    public function update(string $table, int $id, array $values, array $scope = []): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($table)->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
        foreach ($scope as $column => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($column) : $qb->expr()->eq($column, $qb->createNamedParameter($value)));
        }
        foreach ($values as $key => $value) $qb->set($key, $qb->createNamedParameter($value));
        if ($qb->executeStatement() === 0 && !$this->rows($table, ['id' => $id] + $scope)) throw new ConflictException($this->l10n->t('The unit changed. Cancel the move and start again.'));
    }

    public function insert(string $table, array $row): int {
        unset($row['id']);
        $qb = $this->db->getQueryBuilder();
        $values = [];
        foreach ($row as $key => $value) $values[$key] = $qb->createNamedParameter($value);
        $qb->insert($table)->values($values)->executeStatement();
        return (int)$qb->getLastInsertId();
    }

    public function inventory(int $unitId, string $userId): array {
        $owner = ['user_id' => $userId, 'team_id' => null];
        $unit = $this->rows('domus_units', ['id' => $unitId] + $owner)[0] ?? null;
        if (!$unit) throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
        if ($unit['property_id'] !== null) throw new ConflictException($this->l10n->t('Only units without a property can be moved.'));
        $graph = ['domus_units' => [$unit]];
        foreach (['domus_tenancies', 'domus_bookings'] as $table) {
            $graph[$table] = $this->rows($table, ['unit_id' => $unitId] + $owner);
        }
        foreach ($graph['domus_bookings'] as $booking) {
            if (!empty($booking['property_id']) || !empty($booking['distribution_key_id']) || !empty($booking['source_property_booking_id'])) {
                throw new ConflictException($this->l10n->t('Only units without a property can be moved.'));
            }
        }
        if ($this->rows('domus_dist_key_units', ['unit_id' => $unitId, 'team_id' => null])) {
            throw new ConflictException($this->l10n->t('Only units without a property can be moved.'));
        }
        $graph['domus_booking_years'] = $this->rows('domus_booking_years', ['unit_id' => $unitId, 'team_id' => null]);
        $entities = ['unit' => [$unitId], 'tenancy' => array_column($graph['domus_tenancies'], 'id'), 'booking' => array_column($graph['domus_bookings'], 'id')];
        $graph['domus_partner_rel'] = [];
        foreach (['unit', 'tenancy'] as $type) foreach ($entities[$type] as $id) {
            array_push($graph['domus_partner_rel'], ...$this->rows('domus_partner_rel', ['type' => $type, 'relation_id' => (int)$id] + $owner));
        }
        $graph['domus_partners'] = [];
        foreach (array_unique(array_column($graph['domus_partner_rel'], 'partner_id')) as $id) {
            $partner = $this->rows('domus_partners', ['id' => (int)$id] + $owner)[0] ?? null;
            if (!$partner) throw new ConflictException($this->l10n->t('The unit changed. Cancel the move and start again.'));
            $graph['domus_partners'][] = $partner;
        }
        // The supported move is a self-contained unit, including its related contacts.
        $entities['partner'] = array_column($graph['domus_partners'], 'id');
        foreach (['domus_docLinks', 'domus_action_logs', 'domus_tasks', 'domus_workflow_runs', 'domus_task_steps'] as $table) {
            $graph[$table] = [];
            foreach ($entities as $type => $ids) foreach ($ids as $id) {
                if ($type === 'partner' && !in_array($table, ['domus_docLinks', 'domus_action_logs'], true)) continue;
                $scope = in_array($table, ['domus_docLinks', 'domus_action_logs'], true) ? $owner : ['team_id' => null];
                array_push($graph[$table], ...$this->rows($table, ['entity_type' => $type, 'entity_id' => (int)$id] + $scope));
            }
        }
        $graph['accounts'] = array_merge(
            $this->rows('domus_accounts', ['scope_key' => 'global', 'is_system' => 1]),
            $this->rows('domus_accounts', ['scope_key' => 'user:' . $userId, 'team_id' => null]),
        );
        $graph['templates'] = [];
        $graph['templateSteps'] = [];
        foreach (array_unique(array_column($graph['domus_workflow_runs'], 'template_id')) as $id) {
            $template = $this->rows('domus_task_templates', ['id' => (int)$id, 'team_id' => null])[0] ?? null;
            if ($template && !in_array($template['scope_key'], ['global', 'system', 'user:' . $userId, 'archived:' . $id], true)) $template = null;
            if (!$template) throw new ConflictException($this->l10n->t('The unit changed. Cancel the move and start again.'));
            $graph['templates'][] = $template;
            array_push($graph['templateSteps'], ...$this->rows('domus_task_tpl_steps', ['template_id' => (int)$id, 'team_id' => null]));
        }
        $graph['rules'] = [];
        foreach ($this->rows('domus_rule_sets', $owner) as $rule) {
            $definition = json_decode($rule['definition'], true, 512, JSON_THROW_ON_ERROR);
            if ($definition['scope'] === 'allUnits' || ($definition['scope'] === 'units' && in_array($unitId, $definition['scopeIds']))) $graph['rules'][] = $rule;
        }
        $graph['ruleLinks'] = [];
        foreach ($graph['domus_tasks'] as $task) {
            array_push($graph['ruleLinks'], ...$this->rows('domus_rule_tasks', ['task_id' => (int)$task['id']]));
        }
        foreach ($graph as &$rows) usort($rows, fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        return $graph;
    }

    public function fingerprint(array $graph): string {
        return hash('sha256', json_encode($graph, JSON_THROW_ON_ERROR));
    }

    /** Caller owns the move lock and transaction. */
    public function transfer(array $graph, string $teamId, string $userId, array $files, int $folderId, string $path): void {
        $this->copyAccounts($graph['accounts'], $graph['domus_bookings'], $teamId);
        $templateMap = [];
        foreach ($graph['templates'] as $row) {
            $existing = $this->rows('domus_task_templates', ['team_id' => $teamId, 'source_catalogue_id' => (int)$row['id']])[0] ?? null;
            if ($existing) {
                $templateMap[(int)$row['id']] = (int)$existing['id'];
                continue;
            }
            $copy = array_replace($row, ['team_id' => $teamId, 'scope_key' => 'team:' . $teamId, 'source_catalogue_id' => (int)$row['id'], 'system_template_id' => null]);
            if ($this->rows('domus_task_templates', ['scope_key' => 'team:' . $teamId, 'key' => $row['key']]) || $this->rows('domus_task_templates', ['scope_key' => 'system', 'key' => $row['key']])) {
                $copy['key'] = substr($row['key'], 0, 30) . '-move-' . bin2hex(random_bytes(6));
            }
            $newId = $this->insert('domus_task_templates', $copy);
            $templateMap[(int)$row['id']] = $newId;
            foreach ($graph['templateSteps'] as $step) if ((int)$step['template_id'] === (int)$row['id']) {
                $this->insert('domus_task_tpl_steps', array_replace($step, ['team_id' => $teamId, 'template_id' => $newId]));
            }
        }
        $ruleMap = [];
        $unitId = (int)$graph['domus_units'][0]['id'];
        foreach ($graph['rules'] as $row) {
            $definition = json_decode($row['definition'], true, 512, JSON_THROW_ON_ERROR);
            $definition['scope'] = 'units';
            $definition['scopeIds'] = [$unitId];
            $ruleMap[(int)$row['id']] = $this->insert('domus_rule_sets', array_replace($row, ['team_id' => $teamId, 'definition' => json_encode($definition, JSON_THROW_ON_ERROR)]));
        }
        foreach ($graph['ruleLinks'] as $row) {
            if (isset($ruleMap[(int)$row['ruleset_id']])) $this->update('domus_rule_tasks', (int)$row['id'], ['ruleset_id' => $ruleMap[(int)$row['ruleset_id']]]);
        }
        foreach ($graph as $table => $rows) {
            if (!str_starts_with($table, 'domus_')) continue;
            foreach ($rows as $row) {
                $values = ['team_id' => $teamId];
                if ($table === 'domus_units') {
                    $values += ['document_path' => $path, 'document_folder_id' => $folderId, 'updated_at' => time()];
                    if ($row['image_file_id']) $values['image_file_id'] = $files[(int)$row['image_file_id']];
                }
                if ($table === 'domus_docLinks') $values['file_id'] = $files[(int)$row['file_id']];
                if ($table === 'domus_workflow_runs') $values['template_id'] = $templateMap[(int)$row['template_id']];
                if ($table === 'domus_tasks' && $row['rule_id']) $values['rule_id'] = $ruleMap[(int)$row['rule_id']] ?? null;
                $scope = ['team_id' => null];
                if (array_key_exists('user_id', $row)) $scope['user_id'] = $userId;
                $this->update($table, (int)$row['id'], $values, $scope);
            }
        }
        $this->insert('domus_action_logs', [
            'team_id' => $teamId, 'user_id' => $userId, 'entity_type' => 'unit', 'entity_id' => $unitId,
            'type' => 'note', 'title' => $this->l10n->t('Unit moved to Team. Original files retained.'), 'source' => 'manual',
            'created_by' => $userId, 'created_at' => time(), 'updated_at' => time(),
        ]);
    }

    private function copyAccounts(array $accounts, array $bookings, string $teamId): void {
        $byId = array_column($accounts, null, 'id');
        $byNumber = array_column($accounts, null, 'number');
        $mapped = [];
        $copy = function (array $row, array $visited = []) use (&$copy, &$mapped, $byId, $teamId): int {
            $id = (int)$row['id'];
            if (isset($mapped[$id])) return $mapped[$id];
            if (isset($visited[$id])) throw new \RuntimeException('Cyclic account hierarchy.');
            $visited[$id] = true;
            if (!empty($row['is_system'])) return $mapped[$id] = $id;
            $parentId = !empty($row['parent_id']) ? $copy($byId[$row['parent_id']], $visited) : null;
            $existing = $this->rows('domus_accounts', ['scope_key' => 'team:' . $teamId, 'number' => $row['number']])[0] ?? null;
            if ($existing) {
                foreach (['label_de', 'label_en'] as $key) {
                    if ($existing[$key] !== $row[$key]) throw new ConflictException($this->l10n->t('A Team account conflicts with an account used by this unit.'));
                }
                if ((int)$existing['parent_id'] !== (int)$parentId) throw new ConflictException($this->l10n->t('A Team account conflicts with an account used by this unit.'));
                return $mapped[$id] = (int)$existing['id'];
            }
            return $mapped[$id] = $this->insert('domus_accounts', array_replace($row, ['team_id' => $teamId, 'scope_key' => 'team:' . $teamId, 'source_catalogue_id' => $id, 'parent_id' => $parentId]));
        };
        foreach (array_unique(array_column($bookings, 'account')) as $number) {
            if (!isset($byNumber[$number])) throw new ConflictException($this->l10n->t('A Team account conflicts with an account used by this unit.'));
            $copy($byNumber[$number]);
        }
    }
}
