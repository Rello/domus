<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0006Date20260328113000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_tasks')) {
            $table = $schema->getTable('domus_tasks');
            if ($table->hasColumn('unit_id')) {
                $table->dropColumn('unit_id');
            }
        }

        if ($schema->hasTable('domus_workflow_runs')) {
            $table = $schema->getTable('domus_workflow_runs');
            if ($table->hasColumn('unit_id')) {
                $table->dropColumn('unit_id');
            }
        }

        if ($schema->hasTable('domus_task_steps')) {
            $table = $schema->getTable('domus_task_steps');
            if ($table->hasColumn('unit_id')) {
                $table->dropColumn('unit_id');
            }
        }

        return $schema;
    }
}
