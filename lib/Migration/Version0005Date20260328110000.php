<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0005Date20260328110000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_tasks')) {
            $table = $schema->getTable('domus_tasks');
            if ($table->hasColumn('unit_id')) {
                $table->changeColumn('unit_id', ['notnull' => false, 'default' => null]);
            }
        }

        if ($schema->hasTable('domus_workflow_runs')) {
            $table = $schema->getTable('domus_workflow_runs');
            if ($table->hasColumn('unit_id')) {
                $table->changeColumn('unit_id', ['notnull' => false, 'default' => null]);
            }
        }

        if ($schema->hasTable('domus_task_steps')) {
            $table = $schema->getTable('domus_task_steps');
            if ($table->hasColumn('unit_id')) {
                $table->changeColumn('unit_id', ['notnull' => false, 'default' => null]);
            }
        }

        return $schema;
    }
}
