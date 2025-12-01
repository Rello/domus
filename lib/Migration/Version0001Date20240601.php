<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0001Date20240601 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_properties')) {
            $table = $schema->createTable('domus_properties');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('usageRole', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('name', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('street', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('city', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('country', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('type', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->addColumn('updatedAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_props_user');
        }

        if (!$schema->hasTable('domus_units')) {
            $table = $schema->createTable('domus_units');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('propertyId', 'bigint', ['notnull' => true]);
            $table->addColumn('label', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('unitNumber', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('landRegister', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('livingArea', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('usableArea', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('unitType', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->addColumn('updatedAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_units_user');
            $table->addIndex(['propertyId'], 'domus_units_prop');
        }

        if (!$schema->hasTable('domus_partners')) {
            $table = $schema->createTable('domus_partners');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('partnerType', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('name', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('street', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('city', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('country', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('email', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('phone', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('customerRef', 'string', ['length' => 190, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('ncUserId', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->addColumn('updatedAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_partner_user');
        }

        if (!$schema->hasTable('domus_partner_rel')) {
            $table = $schema->createTable('domus_partner_rel');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('relationId', 'bigint', ['notnull' => true]);
            $table->addColumn('partnerId', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_prel_user');
            $table->addIndex(['relationId'], 'domus_prel_rel');
        }

        if (!$schema->hasTable('domus_tenancies')) {
            $table = $schema->createTable('domus_tenancies');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('unitId', 'bigint', ['notnull' => true]);
            $table->addColumn('startDate', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('endDate', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('baseRent', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('serviceCharge', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('serviceChargeAsPrepayment', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('deposit', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('conditions', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->addColumn('updatedAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_ten_user');
            $table->addIndex(['unitId'], 'domus_ten_unit');
        }

        if (!$schema->hasTable('domus_bookings')) {
            $table = $schema->createTable('domus_bookings');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('bookingType', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('category', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('date', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('amount', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('year', 'integer', ['notnull' => true]);
            $table->addColumn('propertyId', 'bigint', ['notnull' => false]);
            $table->addColumn('unitId', 'bigint', ['notnull' => false]);
            $table->addColumn('tenancyId', 'bigint', ['notnull' => false]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->addColumn('updatedAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_book_user');
            $table->addIndex(['year'], 'domus_book_year');
        }

        if (!$schema->hasTable('domus_docLinks')) {
            $table = $schema->createTable('domus_docLinks');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('entityType', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('entityId', 'bigint', ['notnull' => true]);
            $table->addColumn('filePath', 'string', ['notnull' => true, 'length' => 512]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_doc_user');
            $table->addIndex(['entityType', 'entityId'], 'domus_doc_rel');
        }

        if (!$schema->hasTable('domus_reports')) {
            $table = $schema->createTable('domus_reports');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('userId', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('year', 'integer', ['notnull' => true]);
            $table->addColumn('propertyId', 'bigint', ['notnull' => true]);
            $table->addColumn('unitId', 'bigint', ['notnull' => false]);
            $table->addColumn('tenancyId', 'bigint', ['notnull' => false]);
            $table->addColumn('partnerId', 'bigint', ['notnull' => false]);
            $table->addColumn('filePath', 'string', ['notnull' => true, 'length' => 512]);
            $table->addColumn('createdAt', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['userId'], 'domus_rep_user');
            $table->addIndex(['propertyId'], 'domus_rep_prop');
        }

        return $schema;
    }
}
