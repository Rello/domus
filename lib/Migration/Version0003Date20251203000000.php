<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0003Date20251203000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_task_tpl_steps')) {
            $table = $schema->getTable('domus_task_tpl_steps');
            if (!$table->hasColumn('action_type')) {
                $table->addColumn('action_type', 'string', ['length' => 64, 'notnull' => false]);
            }
            if (!$table->hasColumn('action_url')) {
                $table->addColumn('action_url', 'text', ['notnull' => false]);
            }
        }

        if ($schema->hasTable('domus_task_steps')) {
            $table = $schema->getTable('domus_task_steps');
            if (!$table->hasColumn('action_type')) {
                $table->addColumn('action_type', 'string', ['length' => 64, 'notnull' => false]);
            }
            if (!$table->hasColumn('action_url')) {
                $table->addColumn('action_url', 'text', ['notnull' => false]);
            }
        }

        return $schema;
    }
}
