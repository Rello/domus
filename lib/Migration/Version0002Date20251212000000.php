<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0002Date20251212000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');
            if ($table->hasColumn('property_id') && $table->getColumn('property_id')->getNotnull()) {
                $table->changeColumn('property_id', ['notnull' => false]);
            }
        }

        return $schema;
    }
}
