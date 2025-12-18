<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0003Date20251203000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_distribution_keys')) {
            $table = $schema->createTable('domus_distribution_keys');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('property_id', 'bigint', ['notnull' => true]);
            $table->addColumn('type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('name', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('config_json', 'text', ['notnull' => false]);
            $table->addColumn('valid_from', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('valid_to', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_dist_keys_user');
            $table->addIndex(['property_id'], 'domus_dist_keys_prop');
        }

        if (!$schema->hasTable('domus_dist_key_units')) {
            $table = $schema->createTable('domus_dist_key_units');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('distribution_key_id', 'bigint', ['notnull' => true]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('value', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('valid_from', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('valid_to', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_dku_user');
            $table->addIndex(['distribution_key_id'], 'domus_dku_key');
            $table->addIndex(['unit_id'], 'domus_dku_unit');
        }

        if ($schema->hasTable('domus_bookings')) {
            $table = $schema->getTable('domus_bookings');
            if (!$table->hasColumn('distribution_key_id')) {
                $table->addColumn('distribution_key_id', 'bigint', ['notnull' => false]);
                $table->addIndex(['distribution_key_id'], 'domus_book_dkey');
            }
            if (!$table->hasColumn('status')) {
                $table->addColumn('status', 'string', ['notnull' => true, 'length' => 32, 'default' => 'draft']);
            }
            if (!$table->hasColumn('period_from')) {
                $table->addColumn('period_from', 'string', ['notnull' => false, 'length' => 32]);
            }
            if (!$table->hasColumn('period_to')) {
                $table->addColumn('period_to', 'string', ['notnull' => false, 'length' => 32]);
            }
            if (!$table->hasColumn('source_property_booking_id')) {
                $table->addColumn('source_property_booking_id', 'bigint', ['notnull' => false]);
                $table->addIndex(['source_property_booking_id'], 'domus_book_source');
            }
        }

        return $schema;
    }
}
