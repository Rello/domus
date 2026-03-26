<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0003Date20260326000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');
            if (!$table->hasColumn('country')) {
                $table->addColumn('country', 'string', ['length' => 190, 'notnull' => false]);
            }
        }

        return $schema;
    }
}
