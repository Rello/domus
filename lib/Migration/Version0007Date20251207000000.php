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

        if ($schema->hasTable('domus_task_templates')) {
            $table = $schema->getTable('domus_task_templates');
            if (!$table->hasColumn('enabled')) {
                $table->addColumn('enabled', 'integer', ['notnull' => true, 'default' => 1]);
            }
        }

        return $schema;
    }
}
