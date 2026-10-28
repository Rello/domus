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

class Version0007Date20261027000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
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
}
