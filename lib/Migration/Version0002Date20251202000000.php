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

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');
            if ($table->hasColumn('usable_area')) {
                $table->dropColumn('usable_area');
            }
            if ($table->hasColumn('official_id') && !$table->hasColumn('tax_id')) {
                $table->renameColumn('official_id', 'tax_id');
            }
        }

        if ($schema->hasTable('domus_tenancies')) {
            $table = $schema->getTable('domus_tenancies');
            if ($table->hasColumn('service_charge_as_prepayment')) {
                $table->dropColumn('service_charge_as_prepayment');
            }
        }

        if ($schema->hasTable('domus_bookings')) {
            $table = $schema->getTable('domus_bookings');
            if ($table->hasColumn('tenancy_id')) {
                $table->dropColumn('tenancy_id');
            }
        }

        if ($schema->hasTable('domus_reports')) {
            $schema->dropTable('domus_reports');
        }

        return $schema;
    }
}
