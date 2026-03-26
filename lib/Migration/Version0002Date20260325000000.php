<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0002Date20260325000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_properties')) {
            $table = $schema->getTable('domus_properties');
            if (!$table->hasColumn('image_file_id')) {
                $table->addColumn('image_file_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasColumn('image_file_name')) {
                $table->addColumn('image_file_name', 'string', ['notnull' => false, 'length' => 512]);
            }
        }

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');
            if (!$table->hasColumn('image_file_id')) {
                $table->addColumn('image_file_id', 'bigint', ['notnull' => false]);
            }
            if (!$table->hasColumn('image_file_name')) {
                $table->addColumn('image_file_name', 'string', ['notnull' => false, 'length' => 512]);
            }
        }

        return $schema;
    }
}
