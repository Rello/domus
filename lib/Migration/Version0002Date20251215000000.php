<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0002Date20251215000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');

            if (!$table->hasColumn('buy_date')) {
                $table->addColumn('buy_date', 'string', ['length' => 32, 'notnull' => false]);
            }
            if (!$table->hasColumn('total_costs')) {
                $table->addColumn('total_costs', 'string', ['length' => 32, 'notnull' => false]);
            }
            if (!$table->hasColumn('official_id')) {
                $table->addColumn('official_id', 'string', ['length' => 190, 'notnull' => false]);
            }
            if (!$table->hasColumn('iban')) {
                $table->addColumn('iban', 'string', ['length' => 64, 'notnull' => false]);
            }
            if (!$table->hasColumn('bic')) {
                $table->addColumn('bic', 'string', ['length' => 64, 'notnull' => false]);
            }
        }

        return $schema;
    }
}

