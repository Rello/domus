<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0006Date20251206000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_task_templates')) {
            $table = $schema->createTable('domus_task_templates');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('scope', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('property_id', 'bigint', ['notnull' => false]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => false]);
            $table->addColumn('key', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('title', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('order', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('required', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('trigger_type', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('trigger_config', 'text', ['notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_task_tpl_user');
            $table->addIndex(['scope'], 'domus_task_tpl_scope');
            $table->addIndex(['property_id'], 'domus_task_tpl_prop');
            $table->addIndex(['unit_id'], 'domus_task_tpl_unit');
        }

        if (!$schema->hasTable('domus_unit_tasks')) {
            $table = $schema->createTable('domus_unit_tasks');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('year', 'integer', ['notnull' => true]);
            $table->addColumn('template_id', 'bigint', ['notnull' => true]);
            $table->addColumn('status', 'string', ['notnull' => true, 'length' => 32, 'default' => 'open']);
            $table->addColumn('due_date', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('completed_at', 'bigint', ['notnull' => false]);
            $table->addColumn('data_json', 'text', ['notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_unit_task_user');
            $table->addIndex(['unit_id'], 'domus_unit_task_unit');
            $table->addIndex(['year'], 'domus_unit_task_year');
            $table->addIndex(['template_id'], 'domus_unit_task_tpl');
            $table->addIndex(['status'], 'domus_unit_task_status');
        }

        return $schema;
    }
}
