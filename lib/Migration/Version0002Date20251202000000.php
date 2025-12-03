<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0002Date20251202000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_docLinks')) {
            $table = $schema->getTable('domus_docLinks');
            if (!$table->hasColumn('file_id')) {
                $table->addColumn('file_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasColumn('file_name')) {
                $table->addColumn('file_name', 'string', ['notnull' => false, 'length' => 512]);
            }
            if ($table->hasColumn('file_path')) {
                $table->dropColumn('file_path');
            }
        }

        return $schema;
    }
}
