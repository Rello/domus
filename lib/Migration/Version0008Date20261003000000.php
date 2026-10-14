<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0008Date20261003000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        if (!$schema->hasTable('domus_corrections')) {
            $table = $schema->createTable('domus_corrections');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('team_id', 'string', ['length' => 255, 'notnull' => true]);
            $table->addColumn('partner_id', 'bigint', ['notnull' => true]);
            foreach (['requested_by', 'decided_by'] as $name) {
                $table->addColumn($name, 'string', ['length' => 64, 'notnull' => false]);
            }
            foreach (['original_values', 'proposed_values'] as $name) {
                $table->addColumn($name, 'text', ['notnull' => true]);
            }
            $table->addColumn('state', 'string', ['length' => 16, 'notnull' => true]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('decided_at', 'bigint', ['notnull' => false]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['team_id', 'partner_id'], 'domus_correction_contact');
        }
        return $schema;
    }
}
