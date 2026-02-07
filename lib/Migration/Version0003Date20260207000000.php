<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0003Date20260207000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        if (!$schema->hasTable('domus_units')) {
            return $schema;
        }

        $table = $schema->getTable('domus_units');
        if (!$table->hasColumn('street')) {
            $table->addColumn('street', 'string', ['length' => 190, 'notnull' => false]);
        }
        if (!$table->hasColumn('zip')) {
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
        }
        if (!$table->hasColumn('city')) {
            $table->addColumn('city', 'string', ['length' => 190, 'notnull' => false]);
        }

        return $schema;
    }
}
