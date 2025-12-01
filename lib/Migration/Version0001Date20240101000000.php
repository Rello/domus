<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0001Date20240101000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_properties')) {
            $table = $schema->createTable('domus_properties');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('usageRole', 'string', ['length' => 32]);
            $table->addColumn('name', 'string', ['length' => 255]);
            $table->addColumn('street', 'string', ['notnull' => false, 'length' => 255]);
            $table->addColumn('zip', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('city', 'string', ['notnull' => false, 'length' => 255]);
            $table->addColumn('country', 'string', ['notnull' => false, 'length' => 64]);
            $table->addColumn('type', 'string', ['notnull' => false, 'length' => 255]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
        }

        if (!$schema->hasTable('domus_units')) {
            $table = $schema->createTable('domus_units');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('property_id', 'bigint');
            $table->addColumn('label', 'string', ['length' => 255]);
            $table->addColumn('unitNumber', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('landRegister', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('livingArea', 'float', ['notnull' => false]);
            $table->addColumn('usableArea', 'float', ['notnull' => false]);
            $table->addColumn('unitType', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
            $table->addIndex(['property_id']);
        }

        if (!$schema->hasTable('domus_partners')) {
            $table = $schema->createTable('domus_partners');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('partnerType', 'string', ['length' => 64]);
            $table->addColumn('name', 'string', ['length' => 255]);
            $table->addColumn('street', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('zip', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('city', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('country', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('email', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('phone', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('customerRef', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('ncUserId', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
        }

        if (!$schema->hasTable('domus_partner_rel')) {
            $table = $schema->createTable('domus_partner_rel');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('type', 'string', ['length' => 64]);
            $table->addColumn('relationId', 'bigint');
            $table->addColumn('partnerId', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
        }

        if (!$schema->hasTable('domus_tenancies')) {
            $table = $schema->createTable('domus_tenancies');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('unit_id', 'bigint');
            $table->addColumn('partner_id', 'bigint', ['notnull' => false]);
            $table->addColumn('startDate', 'string', ['length' => 32]);
            $table->addColumn('endDate', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('baseRent', 'float');
            $table->addColumn('serviceCharge', 'float', ['notnull' => false]);
            $table->addColumn('serviceChargeAsPrepayment', 'boolean', ['notnull' => false, 'default' => false]);
            $table->addColumn('deposit', 'float', ['notnull' => false]);
            $table->addColumn('conditions', 'text', ['notnull' => false]);
            $table->addColumn('status', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
            $table->addIndex(['unit_id']);
        }

        if (!$schema->hasTable('domus_bookings')) {
            $table = $schema->createTable('domus_bookings');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('property_id', 'bigint', ['notnull' => false]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => false]);
            $table->addColumn('tenancy_id', 'bigint', ['notnull' => false]);
            $table->addColumn('bookingType', 'string', ['length' => 32]);
            $table->addColumn('category', 'string', ['length' => 64]);
            $table->addColumn('amount', 'float');
            $table->addColumn('date', 'string', ['length' => 32]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
        }

        if (!$schema->hasTable('domus_reports')) {
            $table = $schema->createTable('domus_reports');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('property_id', 'bigint');
            $table->addColumn('year', 'integer');
            $table->addColumn('status', 'string', ['length' => 64]);
            $table->addColumn('filePath', 'string', ['length' => 255, 'notnull' => false]);
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('createdAt', 'bigint');
            $table->addColumn('updatedAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
            $table->addIndex(['property_id']);
        }

        if (!$schema->hasTable('domus_documents')) {
            $table = $schema->createTable('domus_documents');
            $table->addColumn('id', 'bigint', ['autoincrement' => true]);
            $table->addColumn('user_id', 'string', ['length' => 64]);
            $table->addColumn('entity_type', 'string', ['length' => 64]);
            $table->addColumn('entity_id', 'bigint');
            $table->addColumn('filePath', 'string', ['length' => 255]);
            $table->addColumn('createdAt', 'bigint');
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id']);
        }

        return $schema;
    }
}
