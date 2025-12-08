<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0002Date20251202000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_properties')) {
            $table = $schema->getTable('domus_properties');
            if (!$table->hasColumn('usage_role')) {
                $table->addColumn('usage_role', 'string', ['notnull' => true, 'length' => 32, 'default' => 'manager']);
            }
        }

        return $schema;
    }
}
