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

        if ($schema->hasTable('domus_partner_rel')) {
            $table = $schema->getTable('domus_partner_rel');
            if (!$table->hasIndex('domus_prel_uniq')) {
                $table->addUniqueIndex(['user_id', 'type', 'relation_id', 'partner_id'], 'domus_prel_uniq');
            }
        }

        return $schema;
    }
}
