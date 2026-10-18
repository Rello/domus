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

class Version0005Date20261016000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        if (!$schema->hasTable('domus_rule_sets')) {
            $table = $schema->createTable('domus_rule_sets');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('team_id', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('definition', 'text', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['team_id'], 'domus_rules_team');
            $table->addIndex(['user_id'], 'domus_rules_user');
        }
        if (!$schema->hasTable('domus_rule_tasks')) {
            $table = $schema->createTable('domus_rule_tasks');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('ruleset_id', 'bigint', ['notnull' => true]);
            $table->addColumn('occurrence_key', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('task_id', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['ruleset_id', 'occurrence_key'], 'domus_rule_occurrence');
        }
        if (!$schema->hasTable('domus_rule_context')) {
            $table = $schema->createTable('domus_rule_context');
            $table->addColumn('entity_type', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('entity_id', 'bigint', ['notnull' => true]);
            $table->addColumn('data', 'text', ['notnull' => true]);
            $table->setPrimaryKey(['entity_type', 'entity_id']);
        }
        $tasks = $schema->getTable('domus_tasks');
        foreach (['deferred_until', 'rule_id', 'rule_tenancy_id'] as $column) {
            if (!$tasks->hasColumn($column)) $tasks->addColumn($column, 'bigint', ['notnull' => false]);
        }
        $steps = $schema->getTable('domus_task_steps');
        if (!$steps->hasColumn('deferred_until')) {
            $steps->addColumn('deferred_until', 'bigint', ['notnull' => false]);
        }
        return $schema;
    }
}
