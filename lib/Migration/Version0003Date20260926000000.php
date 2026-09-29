<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0003Date20260926000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $db) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        foreach (['domus_task_tpl_steps', 'domus_task_steps'] as $name) {
            $table = $schema->getTable($name);
            if (!$table->hasColumn('allow_early_completion')) {
                $table->addColumn('allow_early_completion', 'integer', ['notnull' => true, 'default' => 0]);
            }
        }
        $table = $schema->getTable('domus_workflow_runs');
        if (!$table->hasColumn('completion_type')) {
            $table->addColumn('completion_type', 'string', ['notnull' => false, 'length' => 32]);
        }
        if (!$table->hasColumn('closed_by')) {
            $table->addColumn('closed_by', 'string', ['notnull' => false, 'length' => 64]);
        }
        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        // Keep historical defaults here instead of depending on changing app services.
        $query = $this->db->getQueryBuilder();
        $query->select('id')->from('domus_task_templates')
            ->where($query->expr()->eq('key', $query->createNamedParameter('dunning')))
            ->andWhere($query->expr()->eq('applies_to', $query->createNamedParameter('unit')));
        $result = $query->executeQuery();
        $templates = $result->fetchAll();
        $result->closeCursor();
        foreach ($templates as $template) {
            $query = $this->db->getQueryBuilder();
            $query->select('*')->from('domus_task_tpl_steps')
                ->where($query->expr()->eq('template_id', $query->createNamedParameter((int)$template['id'], $query::PARAM_INT)))
                ->orderBy('sort_order', 'ASC');
            $result = $query->executeQuery();
            $steps = $result->fetchAll();
            $result->closeCursor();
            if (!self::matchesBundledDunning($steps)) {
                continue;
            }
            $query = $this->db->getQueryBuilder();
            $query->update('domus_task_tpl_steps')
                ->set('allow_early_completion', $query->createNamedParameter(1, $query::PARAM_INT))
                ->where($query->expr()->eq('template_id', $query->createNamedParameter((int)$template['id'], $query::PARAM_INT)))
                ->andWhere($query->expr()->gte('sort_order', $query->createNamedParameter(2, $query::PARAM_INT)));
            $query->executeStatement();
        }
        // Existing run steps retain their snapshot; only future runs get the new default.
    }

    public static function matchesBundledDunning(array $steps): bool {
        $defaults = [
            ['Send reminder', 'Send the initial payment reminder to the tenant.'],
            ['Second reminder', 'Follow up with a second reminder after the grace period.'],
            ['Court reminder', 'Escalate to a formal court reminder if needed.'],
            ['Start cancellation process', 'Begin the cancellation process if no payment arrives.'],
        ];
        if (count($steps) !== count($defaults)) return false;
        foreach ($defaults as $index => [$title, $description]) {
            $step = $steps[$index];
            if ((int)$step['sort_order'] !== $index + 1 || $step['title'] !== $title || $step['description'] !== $description
                || (int)$step['default_due_days_offset'] !== 0 || !empty($step['action_type']) || !empty($step['action_url'])) {
                return false;
            }
        }
        return true;
    }
}
