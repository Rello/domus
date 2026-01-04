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
            if (!$table->hasColumn('key')) {
                $table->addColumn('key', 'string', ['length' => 64, 'notnull' => true]);
            }
            if (!$table->hasColumn('name')) {
                $table->addColumn('name', 'string', ['length' => 190, 'notnull' => true]);
            }
            if (!$table->hasColumn('description')) {
                $table->addColumn('description', 'text', ['notnull' => false]);
            }
            if (!$table->hasColumn('applies_to')) {
                $table->addColumn('applies_to', 'string', ['length' => 32, 'notnull' => true]);
            }
            if (!$table->hasColumn('is_active')) {
                $table->addColumn('is_active', 'integer', ['notnull' => true, 'default' => 1]);
            }
            if (!$table->hasColumn('created_at')) {
                $table->addColumn('created_at', 'bigint', ['notnull' => true, 'default' => 0]);
            }
            if (!$table->hasColumn('updated_at')) {
                $table->addColumn('updated_at', 'bigint', ['notnull' => true, 'default' => 0]);
            }
            if (!$table->hasIndex('domus_task_tpl_key')) {
                $table->addUniqueIndex(['key'], 'domus_task_tpl_key');
            }
        }

        return $schema;
    }
}
