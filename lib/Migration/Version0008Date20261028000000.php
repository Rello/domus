<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Final schema additions since the 1.2 release; safe on existing beta schemas. */
class Version0008Date20261028000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        $documents = $schema->getTable('domus_docLinks');
        if (!$documents->hasColumn('document_date')) {
            $documents->addColumn('document_date', 'string', ['length' => 10, 'notnull' => false]);
        }
        $units = $schema->getTable('domus_units');
        if (!$units->hasColumn('document_folder_id')) {
            $units->addColumn('document_folder_id', 'bigint', ['notnull' => false]);
        }
        if (!$schema->hasTable('domus_unit_moves')) {
            $table = $schema->createTable('domus_unit_moves');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('team_id', 'string', ['length' => 255, 'notnull' => true]);
            $table->addColumn('status', 'string', ['length' => 16, 'notnull' => true]);
            $table->addColumn('data', 'text', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['unit_id'], 'domus_move_unit');
            $table->addIndex(['user_id', 'status'], 'domus_move_owner');
        }
        $templates = $schema->getTable('domus_task_templates');
        if (!$templates->hasColumn('system_template_id')) {
            $templates->addColumn('system_template_id', 'bigint', ['notnull' => false]);
        }
        if (!$templates->hasIndex('domus_tpl_scope_system')) {
            $templates->addUniqueIndex(['scope_key', 'system_template_id'], 'domus_tpl_scope_system');
        }
        $steps = $schema->getTable('domus_task_steps');
        if (!$steps->hasColumn('default_due_days_offset')) {
            $steps->addColumn('default_due_days_offset', 'integer', ['notnull' => false]);
        }
        return $schema;
    }

    public function __construct(
        private \OCP\IDBConnection $db,
        private \OCP\IUserManager $users,
        private \OCP\IGroupManager $groups,
    ) {
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $this->db->beginTransaction();
        try {
            $accounts = $this->rows('domus_accounts', ['scope_key' => 'global', 'team_id' => null, 'is_system' => 0]);
            $templates = $this->rows('domus_task_templates', ['scope_key' => 'global', 'team_id' => null]);
            $systemIds = [];
            $defaults = self::bundledTemplates();
            foreach ($defaults as $key => $definition) {
                $existing = $this->rows('domus_task_templates', ['scope_key' => 'system', 'key' => $key]);
                if ($existing !== []) {
                    $systemIds[$key] = (int)$existing[0]['id'];
                    continue;
                }
                $now = time();
                $systemIds[$key] = $this->insertRow('domus_task_templates', $definition['template'] + [
                    'key' => $key, 'scope_key' => 'system', 'created_at' => $now, 'updated_at' => $now,
                ]);
                foreach ($definition['steps'] as $step) {
                    $this->insertRow('domus_task_tpl_steps', $step + [
                        'template_id' => $systemIds[$key], 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
            }
            $templateSteps = [];
            foreach ($templates as $template) {
                $templateSteps[(int)$template['id']] = $this->rows('domus_task_tpl_steps', ['template_id' => (int)$template['id']]);
            }
            if ($accounts !== [] || $templates !== []) {
                foreach ($this->personalOwners() as $uid) {
                    $scope = 'user:' . $uid;
                    $accountIds = [];
                    $newAccounts = [];
                    foreach ($accounts as $account) {
                        [$id, $created] = $this->copyCatalogueRow('domus_accounts', $account, $scope, 'number');
                        $accountIds[(int)$account['id']] = $id;
                        if ($created) $newAccounts[$id] = $account;
                    }
                    // Remap after every parent has a destination, independent of row order.
                    foreach ($newAccounts as $id => $account) {
                        $parent = $account['parent_id'] ?? null;
                        if ($parent !== null && isset($accountIds[(int)$parent])) {
                            $this->updateRow('domus_accounts', $id, ['parent_id' => $accountIds[(int)$parent]]);
                        }
                    }
                    foreach ($templates as $template) {
                        $steps = $templateSteps[(int)$template['id']];
                        $key = $template['key'];
                        if (isset($defaults[$key]) && self::matchesDefault($template, $steps, $defaults[$key])) continue;
                        $copy = $template;
                        $copy['system_template_id'] = $systemIds[$key] ?? null;
                        [$id, $created] = $this->copyCatalogueRow('domus_task_templates', $copy, $scope, 'key');
                        if (!$created) continue;
                        foreach ($steps as $step) {
                            unset($step['id']);
                            $step['template_id'] = $id;
                            $step['team_id'] = null;
                            $this->insertRow('domus_task_tpl_steps', $step);
                        }
                    }
                }
            }
            // Old runs used the template's current offset; freeze that value before future edits.
            foreach ($this->rows('domus_task_steps', ['default_due_days_offset' => null]) as $step) {
                $runs = $this->rows('domus_workflow_runs', ['id' => (int)$step['workflow_run_id']]);
                $definitions = $runs === [] ? [] : $this->rows('domus_task_tpl_steps', [
                    'template_id' => (int)$runs[0]['template_id'], 'sort_order' => (int)$step['sort_order'],
                ]);
                $this->updateRow('domus_task_steps', (int)$step['id'], [
                    'default_due_days_offset' => (int)($definitions[0]['default_due_days_offset'] ?? 0),
                ]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /** Legacy catalogues have no creator; preserve access for existing Personal portfolio owners. */
    private function personalOwners(): array {
        $owners = [];
        foreach (['domus_properties', 'domus_units', 'domus_partners', 'domus_partner_rel',
            'domus_tenancies', 'domus_bookings', 'domus_docLinks', 'domus_dist_keys',
            'domus_dist_key_units', 'domus_tasks', 'domus_workflow_runs', 'domus_action_logs', 'domus_rule_sets'] as $table) {
            $ownerColumn = in_array($table, ['domus_tasks', 'domus_workflow_runs'], true) ? 'created_by' : 'user_id';
            foreach ($this->rows($table, ['team_id' => null], [$ownerColumn]) as $row) {
                $uid = (string)$row[$ownerColumn];
                if ($uid !== '') $owners[$uid] = $uid;
            }
        }
        return array_values(array_filter($owners, fn ($uid) =>
            $this->users->get($uid) !== null && !$this->groups->isInGroup($uid, 'guest_app')));
    }

    private function copyCatalogueRow(string $table, array $row, string $scope, string $key): array {
        $existing = $this->rows($table, ['scope_key' => $scope, $key => $row[$key]]);
        if ($existing !== []) {
            if ((int)($existing[0]['source_catalogue_id'] ?? 0) !== (int)$row['id']) {
                // Never overwrite a newer scoped customization or silently discard a legacy one.
                throw new \RuntimeException('Domus catalogue migration conflict in ' . $table . ' for ' . $scope . ', ' . $key . '=' . $row[$key]);
            }
            return [(int)$existing[0]['id'], false];
        }
        $row['source_catalogue_id'] = (int)$row['id'];
        unset($row['id']);
        $row['scope_key'] = $scope;
        $row['team_id'] = null;
        return [$this->insertRow($table, $row), true];
    }

    private function rows(string $table, array $conditions, array $columns = ['*']): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select(...$columns)->from($table);
        foreach ($conditions as $column => $value) {
            $qb->andWhere($value === null ? $qb->expr()->isNull($column)
                : $qb->expr()->eq($column, $qb->createNamedParameter($value, is_int($value) ? $qb::PARAM_INT : $qb::PARAM_STR)));
        }
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        return $rows;
    }

    private function insertRow(string $table, array $row): int {
        $qb = $this->db->getQueryBuilder();
        $values = [];
        foreach ($row as $column => $value) {
            $values[$column] = $qb->createNamedParameter($value, $value === null ? $qb::PARAM_NULL : (is_int($value) ? $qb::PARAM_INT : $qb::PARAM_STR));
        }
        $qb->insert($table)->values($values)->executeStatement();
        return (int)$qb->getLastInsertId();
    }

    private function updateRow(string $table, int $id, array $values): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($table)->where($qb->expr()->eq('id', $qb->createNamedParameter($id, $qb::PARAM_INT)));
        foreach ($values as $column => $value) $qb->set($column, $qb->createNamedParameter($value, $qb::PARAM_INT));
        $qb->executeStatement();
    }

    private static function matchesDefault(array $template, array $steps, array $default): bool {
        foreach ($default['template'] as $column => $value) {
            if (($template[$column] ?? null) != $value) return false;
        }
        usort($steps, fn ($a, $b) => (int)$a['sort_order'] <=> (int)$b['sort_order']);
        if (count($steps) !== count($default['steps'])) return false;
        foreach ($default['steps'] as $index => $expected) {
            foreach ($expected as $column => $value) {
                if (($steps[$index][$column] ?? null) != $value) return false;
            }
        }
        return true;
    }

    /** Frozen 1.2 defaults: future service changes must not rewrite historical upgrades. */
    private static function bundledTemplates(): array {
        $definitions = [
            'year_end' => ['Year End', [
                ['Invoice received', 'Collect all invoices that belong to the reporting period.', 0, 'document', 0],
                ['Book invoices', 'Record the invoices as bookings for the correct year.', 0, 'booking', 0],
                ['Create year end report', 'Generate the service charge report for the year.', 1, 'serviceChargeReport', 0],
                ['Send report to tenant', 'Send the completed report to the tenant or owner.', 0, null, 0],
                ['Check incoming payment', 'Verify that the settlement payment has been received.', 21, null, 0],
                ['Confirm completed', 'Close the booking year once everything is reconciled.', 0, 'closeBookingYear', 0],
            ]],
            'dunning' => ['Dunning', [
                ['Send reminder', 'Send the initial payment reminder to the tenant.', 0, null, 0],
                ['Second reminder', 'Follow up with a second reminder after the grace period.', 0, null, 1],
                ['Court reminder', 'Escalate to a formal court reminder if needed.', 0, null, 1],
                ['Start cancellation process', 'Begin the cancellation process if no payment arrives.', 0, null, 1],
            ]],
        ];
        $result = [];
        foreach ($definitions as $key => [$name, $steps]) {
            $result[$key] = ['template' => ['name' => $name, 'description' => null, 'applies_to' => 'unit', 'is_active' => 1], 'steps' => []];
            foreach ($steps as $index => [$title, $description, $offset, $action, $early]) {
                $result[$key]['steps'][] = ['sort_order' => $index + 1, 'title' => $title, 'description' => $description,
                    'default_due_days_offset' => $offset, 'action_type' => $action, 'action_url' => null, 'allow_early_completion' => $early];
            }
        }
        return $result;
    }
}
