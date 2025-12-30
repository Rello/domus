<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0001Date20251201000000 extends SimpleMigrationStep {
    public function __construct(IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_properties')) {
            $table = $schema->createTable('domus_properties');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('usage_role', 'string', ['notnull' => true, 'length' => 32, 'default' => 'manager']);
            $table->addColumn('name', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('street', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('city', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('country', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('type', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id'], 'domus_dk_pk');
            $table->addIndex(['user_id'], 'domus_props_user');
        }

        if (!$schema->hasTable('domus_units')) {
            $table = $schema->createTable('domus_units');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('property_id', 'bigint', ['notnull' => false]);
            $table->addColumn('label', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('unit_number', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('land_register', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('living_area', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('unit_type', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('buy_date', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('total_costs', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('tax_id', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('iban', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('bic', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id'], 'domus_dku_pk');
            $table->addIndex(['user_id'], 'domus_units_user');
            $table->addIndex(['property_id'], 'domus_units_prop');
        }

        if (!$schema->hasTable('domus_partners')) {
            $table = $schema->createTable('domus_partners');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('partner_type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('name', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('street', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('city', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('country', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('email', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('phone', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('customer_ref', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('nc_user_id', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_partner_user');
        }

        if (!$schema->hasTable('domus_partner_rel')) {
            $table = $schema->createTable('domus_partner_rel');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('relation_id', 'bigint', ['notnull' => true]);
            $table->addColumn('partner_id', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_prel_user');
            $table->addIndex(['relation_id'], 'domus_prel_rel');
        }

        if (!$schema->hasTable('domus_tenancies')) {
            $table = $schema->createTable('domus_tenancies');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('start_date', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('end_date', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('base_rent', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('service_charge', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('deposit', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('conditions', 'text', ['notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_ten_user');
            $table->addIndex(['unit_id'], 'domus_ten_unit');
        }

        if (!$schema->hasTable('domus_bookings')) {
            $table = $schema->createTable('domus_bookings');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('account', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('date', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('delivery_date', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('amount', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('year', 'integer', ['notnull' => true]);
            $table->addColumn('property_id', 'bigint', ['notnull' => false]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => false]);
            $table->addColumn('distribution_key_id', 'bigint', ['notnull' => false]);
            $table->addColumn('status', 'string', ['notnull' => true, 'length' => 32, 'default' => 'draft']);
            $table->addColumn('period_from', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('period_to', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('source_property_booking_id', 'bigint', ['notnull' => false]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_book_user');
            $table->addIndex(['year'], 'domus_book_year');
            $table->addIndex(['distribution_key_id'], 'domus_book_dkey');
            $table->addIndex(['source_property_booking_id'], 'domus_book_source');
        }

        if (!$schema->hasTable('domus_docLinks')) {
            $table = $schema->createTable('domus_docLinks');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('entity_type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('entity_id', 'bigint', ['notnull' => true]);
            $table->addColumn('file_id', 'bigint', ['notnull' => true, 'default' => 0]);
            $table->addColumn('file_name', 'string', ['notnull' => false, 'length' => 512]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_doc_user');
            $table->addIndex(['entity_type', 'entity_id'], 'domus_doc_rel');
        }

        if (!$schema->hasTable('domus_dist_keys')) {
            $table = $schema->createTable('domus_dist_keys');
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

        return $schema;
    }
}
