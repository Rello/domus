<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0004Date20251204000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_booking_years')) {
            $table = $schema->createTable('domus_booking_years');
            $table->addColumn('id', 'bigint', [
                'autoincrement' => true,
                'notnull' => true,
                'unsigned' => true,
                'length' => 20,
            ]);
            $table->addColumn('property_id', 'bigint', ['notnull' => false]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => false]);
            $table->addColumn('year', 'integer', ['notnull' => true]);
            $table->addColumn('closed_at', 'integer', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['property_id'], 'domus_book_year_prop');
            $table->addIndex(['unit_id'], 'domus_book_year_unit');
            $table->addIndex(['year'], 'domus_book_year_year');
            $table->addUniqueIndex(['year', 'property_id', 'unit_id'], 'domus_book_year_uniq');
        }

        return $schema;
    }
}
