<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0004Date20251204000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_bookings')) {
            $table = $schema->getTable('domus_bookings');
            if (!$table->hasColumn('delivery_date')) {
                $table->addColumn('delivery_date', 'string', ['notnull' => false, 'length' => 32]);
            }
        }

        return $schema;
    }
}
