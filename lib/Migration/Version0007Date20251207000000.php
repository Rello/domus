<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0007Date20251207000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_workflow_runs')) {
            $table = $schema->getTable('domus_workflow_runs');
            if ($table->hasIndex('domus_wrk_run_year')) {
                $table->dropIndex('domus_wrk_run_year');
            }
        }

        return $schema;
    }
}
