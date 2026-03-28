<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0004Date20260328000000 extends SimpleMigrationStep {
    public function __construct(
        private IDBConnection $connection,
    ) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_tasks')) {
            $table = $schema->getTable('domus_tasks');
            if (!$table->hasColumn('entity_type')) {
                $table->addColumn('entity_type', 'string', ['length' => 32, 'notnull' => false, 'default' => 'unit']);
            }
            if (!$table->hasColumn('entity_id')) {
                $table->addColumn('entity_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasIndex('domus_task_ent')) {
                $table->addIndex(['entity_type', 'entity_id'], 'domus_task_ent');
            }
        }

        if ($schema->hasTable('domus_workflow_runs')) {
            $table = $schema->getTable('domus_workflow_runs');
            if (!$table->hasColumn('entity_type')) {
                $table->addColumn('entity_type', 'string', ['length' => 32, 'notnull' => false, 'default' => 'unit']);
            }
            if (!$table->hasColumn('entity_id')) {
                $table->addColumn('entity_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasIndex('domus_wrk_run_ent')) {
                $table->addIndex(['entity_type', 'entity_id'], 'domus_wrk_run_ent');
            }
        }

        if ($schema->hasTable('domus_task_steps')) {
            $table = $schema->getTable('domus_task_steps');
            if (!$table->hasColumn('entity_type')) {
                $table->addColumn('entity_type', 'string', ['length' => 32, 'notnull' => false, 'default' => 'unit']);
            }
            if (!$table->hasColumn('entity_id')) {
                $table->addColumn('entity_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasIndex('domus_task_step_ent')) {
                $table->addIndex(['entity_type', 'entity_id'], 'domus_task_step_ent');
            }
        }

        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $this->connection->executeStatement(
            "UPDATE `*PREFIX*domus_tasks` SET `entity_type` = 'unit', `entity_id` = `unit_id` WHERE `entity_id` IS NULL AND `unit_id` IS NOT NULL"
        );
        $this->connection->executeStatement(
            "UPDATE `*PREFIX*domus_workflow_runs` SET `entity_type` = 'unit', `entity_id` = `unit_id` WHERE `entity_id` IS NULL AND `unit_id` IS NOT NULL"
        );
        $this->connection->executeStatement(
            "UPDATE `*PREFIX*domus_task_steps` SET `entity_type` = 'unit', `entity_id` = `unit_id` WHERE `entity_id` IS NULL AND `unit_id` IS NOT NULL"
        );
    }
}
